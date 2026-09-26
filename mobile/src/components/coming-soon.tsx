import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/constants/brand';

// Placeholder for a tab whose real screen is the next thing being built.
export function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.box}>
        <Text style={styles.body}>{body}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper, paddingHorizontal: 20, paddingTop: 12 },
  title: { fontSize: 30, fontWeight: '800', color: Brand.ink, marginBottom: 16 },
  box: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C4B8', padding: 20 },
  body: { fontSize: 16, lineHeight: 24, color: Brand.muted },
});
