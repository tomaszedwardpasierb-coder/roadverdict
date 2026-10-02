// The small "Report" link beside every piece of AI-written text in the app
// (assistant replies, the story, the comparison summary, the buying
// briefing). Google Play's AI-generated content policy requires a way to
// report offensive AI content without leaving the app. A report goes to the
// same feedback inbox as Settings > Feedback, marked as a report, with the
// text itself so it can be reviewed.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export type AiFeature = 'assistant' | 'story' | 'comparison' | 'buying';

const LABELS: Record<AiFeature, string> = {
  assistant: 'Assistant reply',
  story: 'The story so far',
  comparison: 'Comparison summary',
  buying: 'Buying guide briefing',
};

// The feedback route takes up to 4,000 characters; the label and a note
// that it was cut short fit in the rest.
const MAX_TEXT = 3800;

export function ReportAi({ feature, text }: { feature: AiFeature; text: string }) {
  const { token } = useAuth();
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function send() {
    setState('sending');
    const clipped = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\u00a0… (cut short)` : text;
    const result = await apiFetch('/api/account/feedback', {
      method: 'POST',
      token,
      body: { type: 'ai_report', message: `${LABELS[feature]}:\n\n${clipped}` },
    });
    if (result.ok) {
      setState('sent');
      Alert.alert('Thanks for reporting it', 'The RoadVerdict team will look at it.');
    } else {
      setState('idle');
      Alert.alert('Couldn’t send the report', result.error);
    }
  }

  function confirm() {
    Alert.alert(
      'Report this?',
      'Tell us if this AI-written text is offensive, harmful or plainly wrong. It’s sent to the RoadVerdict team to review.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Report', style: 'destructive', onPress: () => void send() },
      ]
    );
  }

  return (
    <Pressable
      onPress={confirm}
      disabled={state !== 'idle'}
      accessibilityRole="button"
      accessibilityLabel={state === 'sent' ? 'Reported' : `Report this ${LABELS[feature].toLowerCase()}`}
      hitSlop={10}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Icon name="flag" size={13} color={Brand.muted} strokeWidth={2.2} />
      <Text style={styles.text}>{state === 'sent' ? 'Reported' : state === 'sending' ? 'Sending…' : 'Report'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  pressed: { opacity: 0.6 },
  text: { fontSize: 12, fontWeight: '600', color: Brand.muted },
});
