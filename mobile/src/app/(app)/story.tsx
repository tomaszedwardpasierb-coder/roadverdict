// The Story So Far: the web tab's AI story of the selected vehicle's
// logged history, and its "Getting ready to sell" section (see
// /api/app/story on the server). A story is generated through the web's
// own story-so-far routes, with the vehicle named in a header, and then
// stays for a week - the same once-a-week refresh as the web.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ProLock } from '@/components/pro-lock';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { useVehicle, vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

type Story = { sharedStory: string[]; ownerNotes: string[]; verdictLabel: string; generatedAt: string; nextAvailableAt: string };

type SellerPrep = {
  totalRecords: number;
  receiptCoveragePct: number;
  realTimePct: number;
  mileageConsistent: boolean;
  issues: { label: string; detail: string; suggestion: string }[];
  upcoming: { label: string; timingDetail: string; overdue: boolean; typical: string | null }[];
  questions: string[];
  plan: { stage: string; detail: string }[];
};

type StoryScreenData = { isPro: boolean; story: Story | null; sellerPrep: SellerPrep | null };

// What the web's story routes answer with.
type StoryResponse = {
  sharedStory: string[];
  ownerNotes: string[];
  verdict: { label: string };
  generatedAt: string;
  nextAvailableAt: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The web's own wording for how long until the next refresh.
function timeLeftText(nextAvailableAt: string): string {
  const msLeft = new Date(nextAvailableAt).getTime() - Date.now();
  if (msLeft <= 0) return '';
  const daysLeft = Math.ceil(msLeft / 86400000);
  const hoursLeft = Math.ceil(msLeft / 3600000);
  return daysLeft > 1 ? `${daysLeft} days` : hoursLeft > 1 ? `${hoursLeft} hours` : 'less than an hour';
}

export default function StoryScreen() {
  const { selected } = useVehicle();
  const screen = useApi<StoryScreenData>(selected ? `/api/app/story?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            The Story So Far
          </Text>
          {selected ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[selected.name, selected.registration].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {!selected ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No vehicle yet</Text>
        </View>
      ) : screen.error && !screen.data ? (
        <ErrorState message={screen.error} onRetry={screen.retry} />
      ) : !screen.data ? (
        <LoadingState />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={screen.refreshing} onRefresh={screen.refresh} colors={[Brand.amberInk]} />}>
          {screen.data.isPro ? (
            <StoryBody key={`${selected.kind}:${selected.id}`} vehicle={selected} data={screen.data} />
          ) : (
            <ProLock
              feature="The Story So Far"
              description={`An AI-generated narrative of your ownership - your ${selected.kind}'s history told as a story, with insights on what's been done, what's coming, and how your costs compare.`}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StoryBody({ vehicle, data }: { vehicle: GarageVehicle; data: StoryScreenData }) {
  const { token, signOut } = useAuth();
  const [fresh, setFresh] = useState<Story | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const story = fresh ?? data.story;
  const noun = vehicle.kind === 'bike' ? 'bike' : 'car';
  // Re-worked out on every render, which is enough for a wait measured
  // in days - as the web does.
  const canRegenerate = !story || new Date(story.nextAvailableAt).getTime() <= Date.now();

  async function generate() {
    if (working) return;
    setWorking(true);
    setProblem(null);
    const response = await apiFetch<StoryResponse>(vehicle.kind === 'bike' ? '/api/tracker/story-so-far' : '/api/cars/car-story-so-far', {
      token,
      headers: vehicleHeaders(vehicle),
    });
    setWorking(false);
    if (response.ok) {
      const r = response.data;
      setFresh({ sharedStory: r.sharedStory, ownerNotes: r.ownerNotes, verdictLabel: r.verdict?.label ?? '', generatedAt: r.generatedAt, nextAvailableAt: r.nextAvailableAt });
      return;
    }
    if (response.status === 401) {
      await signOut();
      return;
    }
    setProblem(response.error || 'Could not generate the story. Try again.');
  }

  const button = (
    <Pressable
      onPress={generate}
      disabled={working || !canRegenerate}
      accessibilityRole="button"
      accessibilityState={{ disabled: working || !canRegenerate, busy: working }}
      style={({ pressed }) => [story ? styles.secondary : styles.primary, (working || !canRegenerate) && styles.disabled, pressed && styles.pressed]}>
      {working ? <ActivityIndicator color={story ? Brand.ink : Brand.asphalt} /> : null}
      <Text style={story ? styles.secondaryLabel : styles.primaryLabel}>{working ? 'Putting it together…' : story ? 'Regenerate' : 'Generate my story'}</Text>
    </Pressable>
  );

  return (
    <>
      {story ? (
        <Card style={styles.card}>
          {story.verdictLabel ? (
            <Text style={styles.text}>
              Documentation: <Text style={styles.strong}>{story.verdictLabel}</Text>
            </Text>
          ) : null}
          <Text style={styles.hint}>Generated {formatDate(story.generatedAt)}</Text>
          {story.sharedStory.map((paragraph, i) => (
            <Text key={i} style={styles.story}>
              {paragraph}
            </Text>
          ))}
          {story.ownerNotes.length > 0 ? (
            <View style={styles.notes}>
              <Text style={styles.notesTitle}>For you only - never shown to a buyer</Text>
              {story.ownerNotes.map((note, i) => (
                <Text key={i} style={styles.notesText}>
                  {note}
                </Text>
              ))}
            </View>
          ) : null}
          {button}
          {!canRegenerate ? (
            <Text style={styles.hint}>
              Stories refresh once a week to keep AI use sensible. Next refresh available in {timeLeftText(story.nextAvailableAt)}.
            </Text>
          ) : null}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.text}>
            What your logged history says about this {noun} - where it&apos;s strong, where a bit more logging would strengthen it, and the same story you can hand a
            buyer when you&apos;re ready to sell, backed by real dates and receipts, not just your word.
          </Text>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Best used once you&apos;ve built up a decent spread of history with receipts and supporting documents attached, rather than straight after adding the{' '}
              {noun}. If you run it too early, when there are only a handful of entries, the result is likely to have little or no real value. It may simply come
              back as &quot;Limited documentation&quot;, or produce a summary that doesn&apos;t tell the {noun}&apos;s story properly at all, regardless of how good
              its actual history is.
            </Text>
          </View>
          {button}
        </Card>
      )}

      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}

      {data.sellerPrep ? <GettingReady prep={data.sellerPrep} /> : null}
    </>
  );
}

// Worked out fresh every time, without AI - where the record stands
// before a buyer ever sees it.
function GettingReady({ prep }: { prep: SellerPrep }) {
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        Getting ready to sell
      </Text>
      <Text style={styles.hint}>
        A buyer opening a share link sees this exact record, read the same way - here&apos;s how it currently looks, and what&apos;s worth doing before you list it.
      </Text>

      {prep.totalRecords === 0 ? (
        <Text style={styles.text}>Nothing logged yet - start adding your service history, fuel, and bills to build the record a buyer will eventually see here.</Text>
      ) : (
        <>
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Your record so far</Text>
            <Text style={styles.text}>
              {prep.totalRecords} entries logged, {prep.receiptCoveragePct}% with a receipt attached, {prep.realTimePct}% entered in real time.
            </Text>
            <Text style={styles.text}>
              {prep.mileageConsistent
                ? 'No conflicting mileage readings across your logged entries.'
                : 'At least one logged entry shows a lower mileage than an earlier one - worth checking for a typo.'}
            </Text>
          </View>

          {prep.issues.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Worth addressing before you list</Text>
              {prep.issues.map((issue, i) => (
                <View key={i} style={styles.issue}>
                  <Text style={styles.issueTitle}>{issue.label}</Text>
                  <Text style={styles.noticeText}>{issue.detail}</Text>
                  <Text style={[styles.noticeText, styles.italic]}>{issue.suggestion}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {prep.upcoming.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>What a buyer&apos;s report will show as coming up</Text>
              {prep.upcoming.map((item, i) => (
                <Text key={i} style={styles.text}>
                  • <Text style={styles.strong}>{item.label}</Text> - {item.timingDetail} ({item.overdue ? 'overdue' : 'due soon'})
                  {item.typical ? ` - ${item.typical}` : ''}
                </Text>
              ))}
            </View>
          ) : null}

          {prep.questions.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Questions a buyer is likely to ask - have your answers ready</Text>
              {prep.questions.map((q, i) => (
                <Text key={i} style={styles.text}>
                  • {q}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Your prep checklist</Text>
            {prep.plan.map((step, i) => (
              <Text key={i} style={styles.text}>
                {i + 1}. <Text style={styles.strong}>{step.stage}:</Text> {step.detail}
              </Text>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  content: { padding: 20, paddingTop: 12, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Brand.ink },
  card: { padding: 16, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  story: { fontSize: 16, lineHeight: 25, color: Brand.ink },
  strong: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  hint: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  notes: { gap: 6, padding: 12, borderRadius: 10, backgroundColor: '#FBEACC' },
  notesTitle: { fontSize: 14, fontWeight: '700', color: '#7A4508' },
  notesText: { fontSize: 14, lineHeight: 20, color: '#7A4508' },
  notice: { padding: 12, borderRadius: 10, backgroundColor: '#FBEACC' },
  noticeText: { fontSize: 14, lineHeight: 20, color: '#7A4508' },
  group: { gap: 6 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: Brand.ink },
  issue: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: '#FBEACC' },
  issueTitle: { fontSize: 14, fontWeight: '700', color: '#7A4508' },
  primary: { flexDirection: 'row', gap: 10, height: 52, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  secondary: {
    flexDirection: 'row',
    gap: 10,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
