// Notifications: the same list as the website's bell - reminders turning
// due soon or overdue, and announcements from RoadVerdict. Opening the
// screen marks them read, as opening the bell does on the website. New ones
// sit in their own section on top, so what's new is always clear.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card, ErrorState, LoadingState, SectionHeader } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';

export type AppNotification = {
  id: string;
  kind: 'broadcast' | 'reminder';
  title: string;
  body: string;
  linkTo?: string;
  createdAt: string;
  readAt?: string;
};

export type NotificationList = { notifications: AppNotification[]; unreadCount: number };

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NotificationsScreen() {
  const { token } = useAuth();
  const list = useApi<NotificationList>('/api/tracker/notifications');

  // Seen once the list is on screen - unread ones stay highlighted until
  // the next visit, so it's still clear which were new.
  useEffect(() => {
    if (list.data && list.data.unreadCount > 0) apiFetch('/api/tracker/notifications/mark-read', { method: 'POST', token, body: {} });
  }, [list.data, token]);

  function open(n: AppNotification) {
    if (n.kind === 'reminder') router.push('/reminders');
    // Announcement links are website pages.
    else if (n.linkTo && n.linkTo.startsWith('/')) WebBrowser.openBrowserAsync(`${API_BASE_URL}${n.linkTo}`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Notifications
        </Text>
      </View>

      {list.loading && !list.data ? (
        <LoadingState />
      ) : list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[Brand.amberInk]} />}>
          {list.data && list.data.notifications.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="bell" size={32} color={Brand.muted} />
              <Text style={styles.emptyTitle}>Nothing yet</Text>
              <Text style={styles.emptyText}>Reminders that come due, and news from RoadVerdict, appear here and on your phone.</Text>
            </View>
          ) : (
            <>
              {[
                { title: 'New', items: list.data?.notifications.filter((n) => !n.readAt) ?? [] },
                { title: 'Earlier', items: list.data?.notifications.filter((n) => !!n.readAt) ?? [] },
              ].map((group) =>
                group.items.length === 0 ? null : (
                  <View key={group.title} style={styles.group}>
                    <SectionHeader title={group.title} />
                    <Card>
                      {group.items.map((n, i) => {
                        const unread = !n.readAt;
                        const tappable = n.kind === 'reminder' || !!n.linkTo;
                        return (
                          <Pressable
                            key={n.id}
                            onPress={() => open(n)}
                            disabled={!tappable}
                            accessibilityRole={tappable ? 'button' : undefined}
                            style={({ pressed }) => [styles.row, i > 0 && styles.divider, unread && styles.unread, pressed && { opacity: 0.85 }]}>
                            <View style={[styles.icon, n.kind === 'reminder' ? styles.iconReminder : styles.iconNews]}>
                              <Icon name={n.kind === 'reminder' ? 'bell' : 'sparkle'} size={18} color={Brand.asphalt} />
                            </View>
                            <View style={styles.flex}>
                              <View style={styles.titleRow}>
                                <Text style={[styles.rowTitle, unread && styles.bold]} numberOfLines={2}>
                                  {n.title}
                                </Text>
                                <Text style={styles.time}>{when(n.createdAt)}</Text>
                              </View>
                              <Text style={styles.body}>{n.body}</Text>
                            </View>
                            {unread ? <View style={styles.dot} accessibilityLabel="New" /> : null}
                          </Pressable>
                        );
                      })}
                    </Card>
                  </View>
                )
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  content: { padding: 20, paddingTop: 8, gap: 12 },
  group: { gap: 8 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  emptyText: { fontSize: 15, lineHeight: 22, color: Brand.muted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  unread: { backgroundColor: '#FBF4E8' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconReminder: { backgroundColor: '#FBEACC' },
  iconNews: { backgroundColor: '#E9ECFB' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: Brand.ink },
  bold: { fontWeight: '800' },
  time: { fontSize: 12, color: Brand.muted, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20, color: Brand.muted, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.amber, marginTop: 6 },
});
