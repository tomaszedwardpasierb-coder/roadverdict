// A field that opens a full-screen, searchable list of choices - used for
// service jobs, part types, labour (hundreds of options, so search
// matters), and the shorter bill, fine and toll lists alike.
import { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { findLabel, type OptionGroup } from '@/lib/form-options';

export function OptionPicker({
  label,
  placeholder,
  groups,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  groups: OptionGroup[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const total = groups.reduce((n, g) => n + g.options.length, 0);
  const searchable = total > 12;

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({ title: g.label, data: q ? g.options.filter((o) => o.label.toLowerCase().includes(q)) : g.options }))
      .filter((s) => s.data.length > 0);
  }, [groups, query]);

  const selectedLabel = value ? findLabel(groups, value) : undefined;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel ?? 'not chosen'}`}
        accessibilityHint="Opens a list to choose from"
        style={styles.input}>
        <Text style={[styles.inputText, !selectedLabel && styles.placeholder]} numberOfLines={1}>
          {selectedLabel ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={20} color={Brand.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              {label}
            </Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
              <Icon name="close" size={24} color={Brand.ink} />
            </Pressable>
          </View>
          {searchable ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#A7A49C"
              autoCorrect={false}
              accessibilityLabel="Search the list"
              style={styles.search}
            />
          ) : null}
          <SectionList
            sections={sections}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (section.title ? <Text style={styles.group}>{section.title}</Text> : null)}
            renderItem={({ item }) => {
              const chosen = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  style={({ pressed }) => [styles.option, chosen && styles.optionChosen, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.optionText}>{item.label}</Text>
                  {chosen ? <Icon name="check" size={20} color={Brand.amberInk} /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Nothing matches “{query}”.</Text>}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inputText: { flex: 1, fontSize: 17, color: Brand.ink },
  placeholder: { color: '#A7A49C' },
  modal: { flex: 1, backgroundColor: Brand.paper },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  modalTitle: { flex: 1, fontSize: 24, fontWeight: '800', color: Brand.ink },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  search: {
    marginHorizontal: 20,
    marginBottom: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Brand.ink,
  },
  group: {
    backgroundColor: Brand.paper,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Brand.muted,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EDEAE3',
    backgroundColor: Brand.paperRaised,
  },
  optionChosen: { backgroundColor: '#FBF4E8' },
  optionText: { flex: 1, fontSize: 16, color: Brand.ink },
  empty: { padding: 20, fontSize: 15, color: Brand.muted },
});
