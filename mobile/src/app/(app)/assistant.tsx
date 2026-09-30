// The AI assistant: the website's chat, for the selected vehicle - ask it
// anything about running costs, prices and your own history, or (on Pro)
// tell it what you did and it drafts the entry for you to confirm. Type,
// or tap the microphone and say it.
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryDraft, FeedbackDraft, SettingsDraft, ShareLinkDraft, VaultDraftNote } from '@/components/assistant-cards';
import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { MAX_TURNS, type AssistantReply, type ChatMessage } from '@/lib/assistant';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDictation } from '@/lib/use-dictation';
import { useVehicle, vehicleHeaders } from '@/lib/vehicle';

type Turn = { role: 'user'; content: string } | ({ role: 'assistant'; content: string } & Omit<AssistantReply, 'reply'>);

const MAX_LENGTH = 2000; // the server's own per-message limit

// Opened from the ⊕ sheet, it's there to log something; otherwise to ask.
const PROMPTS = {
  ask: ['What should I budget for this year?', 'When is my next service due?', 'Is my fuel economy normal?'],
  log: ['Filled up 12 litres for £18 today', 'Paid £65 for an MOT this morning', 'New rear tyre fitted for £140'],
};

export default function AssistantScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { selected } = useVehicle();
  const { token, signOut } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dictation = useDictation(draft, setDraft);
  const scroll = useRef<ScrollView>(null);

  const prompts = mode === 'log' ? PROMPTS.log : PROMPTS.ask;

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_LENGTH);
    if (!content || sending) return;
    if (dictation.listening) dictation.stop();
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setDraft('');
    setError(null);
    setSending(true);
    const messages: ChatMessage[] = next.slice(-MAX_TURNS).map((t) => ({ role: t.role, content: t.content }));
    const result = await apiFetch<AssistantReply>('/api/assistant', {
      method: 'POST',
      token,
      // Tells the server this is the app, so it never suggests buying Pro here.
      body: { messages, client: 'android' },
      headers: selected ? vehicleHeaders(selected) : undefined,
    });
    setSending(false);
    if (!result.ok) {
      if (result.status === 401) {
        await signOut();
        return;
      }
      setError(result.error);
      return;
    }
    const { reply, ...drafts } = result.data;
    setTurns((current) => [...current, { role: 'assistant', content: reply, ...drafts }]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Assistant
          </Text>
          {selected ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              About {selected.name}
            </Text>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="height">
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {turns.length === 0 ? (
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <Icon name="sparkle" size={28} color={Brand.asphalt} />
              </View>
              <Text style={styles.introTitle}>{mode === 'log' ? 'Tell it what you did' : 'Ask about your vehicle'}</Text>
              <Text style={styles.introText}>
                {mode === 'log'
                  ? 'Say or type it in your own words - it drafts the entry, and nothing is saved until you tap to confirm.'
                  : 'Running costs, what jobs should cost, your own history and what’s coming up. Type, or tap the microphone and just say it.'}
              </Text>
              <View style={styles.prompts}>
                {prompts.map((p) => (
                  <Pressable key={p} onPress={() => send(p)} accessibilityRole="button" style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.promptText}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <View key={i} style={[styles.bubble, styles.mine]}>
                <Text style={styles.mineText}>{turn.content}</Text>
              </View>
            ) : (
              <View key={i} style={styles.theirsWrap}>
                <View style={[styles.bubble, styles.theirs]}>
                  <Text style={styles.theirsText}>{turn.content}</Text>
                </View>
                {turn.proposedEntry ? <EntryDraft entry={turn.proposedEntry} /> : null}
                {turn.proposedShareLink ? <ShareLinkDraft link={turn.proposedShareLink} /> : null}
                {turn.proposedSettingsChange ? <SettingsDraft change={turn.proposedSettingsChange} /> : null}
                {turn.proposedFeedback ? <FeedbackDraft feedback={turn.proposedFeedback} /> : null}
                {turn.proposedVaultDocument ? <VaultDraftNote /> : null}
              </View>
            )
          )}

          {sending ? (
            <View style={[styles.bubble, styles.theirs, styles.thinking]}>
              <ActivityIndicator color={Brand.muted} size="small" />
              <Text style={styles.thinkingText}>Thinking…</Text>
            </View>
          ) : null}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          {dictation.problem ? <Text style={styles.problem}>{dictation.problem}</Text> : null}
          {dictation.listening ? <Text style={styles.listening}>Listening… tap stop when you’re done</Text> : null}
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={mode === 'log' ? 'e.g. Chain lubed and adjusted, £20' : 'Ask anything'}
              placeholderTextColor="#A7A49C"
              accessibilityLabel="Message to the assistant"
              multiline
              maxLength={MAX_LENGTH}
              style={styles.input}
            />
            {dictation.available ? (
              <Pressable
                onPress={dictation.listening ? dictation.stop : dictation.start}
                accessibilityRole="button"
                accessibilityLabel={dictation.listening ? 'Stop listening' : 'Speak instead of typing'}
                style={({ pressed }) => [styles.roundButton, dictation.listening ? styles.micOn : styles.mic, pressed && { opacity: 0.85 }]}>
                {dictation.listening ? <View style={styles.stopSquare} /> : <Icon name="mic" size={22} color={Brand.ink} />}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => send(draft)}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.roundButton, styles.sendButton, (!draft.trim() || sending) && styles.dim, pressed && { opacity: 0.85 }]}>
              <Icon name="send" size={20} color={Brand.asphalt} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 10 },
  intro: { alignItems: 'center', gap: 10, paddingTop: 24, paddingHorizontal: 8 },
  introIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 20, fontWeight: '800', color: Brand.ink, textAlign: 'center' },
  introText: { fontSize: 15, lineHeight: 22, color: Brand.muted, textAlign: 'center' },
  prompts: { alignSelf: 'stretch', gap: 8, marginTop: 8 },
  prompt: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  promptText: { fontSize: 15, color: Brand.ink },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: Brand.asphalt, borderBottomRightRadius: 4 },
  mineText: { fontSize: 16, lineHeight: 22, color: '#FFFFFF' },
  theirsWrap: { alignSelf: 'stretch' },
  theirs: { alignSelf: 'flex-start', backgroundColor: Brand.paperRaised, borderWidth: 1, borderColor: Brand.line, borderBottomLeftRadius: 4 },
  theirsText: { fontSize: 16, lineHeight: 23, color: Brand.ink },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { fontSize: 15, color: Brand.muted },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  composer: { gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  problem: { fontSize: 13, lineHeight: 18, color: Brand.danger },
  listening: { fontSize: 13, color: '#7A4508' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    fontSize: 16,
    color: Brand.ink,
  },
  roundButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  mic: { borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  micOn: { backgroundColor: '#F8E6E3', borderWidth: 1.5, borderColor: Brand.danger },
  stopSquare: { width: 16, height: 16, borderRadius: 3, backgroundColor: Brand.danger },
  sendButton: { backgroundColor: Brand.amber },
  dim: { opacity: 0.5 },
});
