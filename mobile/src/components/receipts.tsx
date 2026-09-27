// An entry's receipts: photos as thumbnails that open full screen, PDFs
// handed to whichever app on the phone opens PDFs. Both come from the
// website's signed-in attachment route, so every request carries the
// session - and photos are only ever cached in memory, never on disk.
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Entry } from '@/lib/entries';

type Attachment = Entry['attachments'][number];

// A name the phone's file system is happy with, keeping the extension.
function cacheName(fileName: string): string {
  const safe = fileName.replace(/[^\w.-]+/g, '_');
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

export function Receipts({ attachments }: { attachments: Attachment[] }) {
  const { token } = useAuth();
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const photos = attachments.filter((a) => a.fileType !== 'application/pdf');
  const pdfs = attachments.filter((a) => a.fileType === 'application/pdf');

  async function openPdf(pdf: Attachment) {
    setOpening(pdf.path);
    setProblem(null);
    try {
      // Fetched here rather than with a download helper so an error page
      // is never saved and opened as if it were the receipt.
      const response = await fetch(`${API_BASE_URL}${pdf.path}`, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const file = new File(Paths.cache, cacheName(pdf.fileName));
      file.create({ overwrite: true });
      file.write(new Uint8Array(await response.arrayBuffer()));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: pdf.fileName });
    } catch {
      setProblem('That receipt couldn’t be opened. Check your connection and try again.');
    } finally {
      setOpening(null);
    }
  }

  return (
    <View style={styles.wrap}>
      {photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.map((photo) => (
            <Pressable
              key={photo.path}
              onPress={() => setViewing(photo)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Receipt photo ${photo.fileName}. Opens full screen`}
              style={({ pressed }) => [styles.thumb, pressed && { opacity: 0.85 }]}>
              <Image
                source={{ uri: `${API_BASE_URL}${photo.path}`, headers }}
                cachePolicy="memory"
                contentFit="cover"
                style={styles.thumbImage}
                alt={photo.fileName}
              />
            </Pressable>
          ))}
        </View>
      ) : null}

      {pdfs.length > 0 ? (
        <Card>
          {pdfs.map((pdf, i) => (
            <Pressable
              key={pdf.path}
              onPress={() => openPdf(pdf)}
              disabled={opening !== null}
              accessibilityRole="button"
              accessibilityLabel={`PDF receipt ${pdf.fileName}. Opens in another app`}
              style={({ pressed }) => [styles.pdfRow, i > 0 && styles.divider, pressed && { opacity: 0.85 }]}>
              <Icon name="bill" size={22} color={Brand.amberInk} />
              <Text style={styles.pdfName} numberOfLines={1}>
                {pdf.fileName}
              </Text>
              {opening === pdf.path ? <ActivityIndicator color={Brand.amberInk} /> : <Text style={styles.pdfAction}>Open</Text>}
            </Pressable>
          ))}
        </Card>
      ) : null}

      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}

      <Modal visible={viewing !== null} animationType="fade" onRequestClose={() => setViewing(null)}>
        <SafeAreaView style={styles.viewer} edges={['top', 'bottom']}>
          <View style={styles.viewerBar}>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              {viewing?.fileName}
            </Text>
            <Pressable onPress={() => setViewing(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.viewerClose}>
              <Icon name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          {viewing ? (
            <Image
              source={{ uri: `${API_BASE_URL}${viewing.path}`, headers }}
              cachePolicy="memory"
              contentFit="contain"
              style={styles.viewerImage}
              alt={`Receipt photo ${viewing.fileName}`}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 104, height: 104, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Brand.line, backgroundColor: '#EDEAE3' },
  thumbImage: { width: '100%', height: '100%' },
  pdfRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  pdfName: { flex: 1, fontSize: 16, color: Brand.ink },
  pdfAction: { fontSize: 15, fontWeight: '700', color: Brand.amberInk },
  problem: { fontSize: 14, lineHeight: 20, color: Brand.danger },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8, minHeight: 56 },
  viewerTitle: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  viewerClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { flex: 1 },
});
