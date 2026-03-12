import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../lib/useTheme';
import {
  loadModifications,
  addModification,
  updateModification,
  deleteModification,
  bulkDeleteModifications,
  generateId,
  MODIFICATION_CATEGORIES,
  type Modification,
} from '../../lib/garage';

type SortKey = 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';

function sortRecords(records: Modification[], key: SortKey): Modification[] {
  const copy = [...records];
  switch (key) {
    case 'date_desc': return copy.sort((a, b) => (b.dateInstalled ?? '').localeCompare(a.dateInstalled ?? ''));
    case 'date_asc':  return copy.sort((a, b) => (a.dateInstalled ?? '').localeCompare(b.dateInstalled ?? ''));
    case 'title_asc': return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'title_desc': return copy.sort((a, b) => b.title.localeCompare(a.title));
  }
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_desc', label: 'Date Newest' },
  { key: 'date_asc',  label: 'Date Oldest' },
  { key: 'title_asc', label: 'Title A-Z' },
  { key: 'title_desc',label: 'Title Z-A' },
];

interface FormModalProps {
  visible: boolean;
  bikeId: string;
  editing: Modification | null;
  onSave: (r: Modification) => void;
  onClose: () => void;
}

function FormModal({ visible, bikeId, editing, onSave, onClose }: FormModalProps) {
  const { theme } = useTheme();

  const [title, setTitle]         = useState('');
  const [brand, setBrand]         = useState('');
  const [category, setCategory]   = useState(MODIFICATION_CATEGORIES[0]);
  const [dateInstalled, setDate]  = useState('');
  const [cost, setCost]           = useState('');
  const [notes, setNotes]         = useState('');
  const [showCatPicker, setShowCatPicker] = useState(false);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setBrand(editing.brand ?? '');
      setCategory(editing.category);
      setDate(editing.dateInstalled ?? '');
      setCost(editing.cost ? String(editing.cost) : '');
      setNotes(editing.notes ?? '');
    } else {
      setTitle(''); setBrand(''); setCategory(MODIFICATION_CATEGORIES[0]);
      setDate(''); setCost(''); setNotes('');
    }
  }, [editing, visible]);

  function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const record: Modification = {
      id: editing?.id ?? generateId(),
      bikeId,
      title: trimmed,
      brand: brand.trim() || undefined,
      category,
      dateInstalled: dateInstalled.trim() || undefined,
      cost: cost ? parseFloat(cost) : undefined,
      notes: notes.trim() || undefined,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(record);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={[fm.sheet, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}>
          <View style={[fm.handle, { backgroundColor: theme.border }]} />
          <View style={fm.header}>
            <Text style={[fm.heading, { color: theme.textPrimary }]}>{editing ? 'EDIT MOD' : 'ADD MOD'}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={theme.textSecondary} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[fm.label, { color: theme.textSecondary }]}>TITLE</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={title} onChangeText={setTitle}
              placeholder="e.g. Akrapovic exhaust"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>BRAND (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={brand} onChangeText={setBrand}
              placeholder="e.g. Akrapovic"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>CATEGORY</Text>
            <Pressable
              style={[fm.input, fm.pickerBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={() => setShowCatPicker(true)}
            >
              <Text style={{ color: theme.textPrimary }}>{category}</Text>
              <Feather name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>

            {showCatPicker && (
              <View style={[fm.pickerList, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
                  {MODIFICATION_CATEGORIES.map((c) => (
                    <Pressable
                      key={c}
                      style={[fm.pickerItem, { borderBottomColor: theme.border }, c === category && { backgroundColor: theme.red + '22' }]}
                      onPress={() => { setCategory(c); setShowCatPicker(false); }}
                    >
                      <Text style={[fm.pickerItemText, { color: c === category ? theme.red : theme.textPrimary }]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={[fm.label, { color: theme.textSecondary }]}>DATE INSTALLED (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={dateInstalled} onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textMuted}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>COST (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={cost} onChangeText={setCost}
              placeholder="e.g. 450.00"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, fm.textArea, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={notes} onChangeText={setNotes}
              placeholder="Additional details…"
              placeholderTextColor={theme.textMuted}
              multiline numberOfLines={3}
            />

            <Pressable
              style={[fm.saveBtn, { backgroundColor: theme.red }, !title.trim() && { opacity: 0.5 }]}
              onPress={handleSave} disabled={!title.trim()}
            >
              <Text style={fm.saveBtnText}>SAVE</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ModificationsSection({ bikeId }: { bikeId: string }) {
  const { theme } = useTheme();
  const [records, setRecords]     = useState<Modification[]>([]);
  const [sortKey, setSortKey]     = useState<SortKey>('date_desc');
  const [showSort, setShowSort]   = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Modification | null>(null);

  useEffect(() => { loadModifications(bikeId).then(setRecords); }, [bikeId]);

  const sorted = sortRecords(records, sortKey);

  async function handleSave(record: Modification) {
    if (editing) {
      await updateModification(bikeId, record);
      setRecords((prev) => prev.map((r) => r.id === record.id ? record : r));
    } else {
      await addModification(bikeId, record);
      setRecords((prev) => [record, ...prev]);
    }
    setEditing(null);
  }

  function handleEdit(r: Modification) { setEditing(r); setShowForm(true); }

  function handleDelete(r: Modification) {
    Alert.alert('Delete Mod?', `Delete "${r.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteModification(bikeId, r.id);
        setRecords((prev) => prev.filter((x) => x.id !== r.id));
      }},
    ]);
  }

  function handleBulkDelete() {
    const count = selected.size;
    Alert.alert(`Delete ${count} mod${count > 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const ids = Array.from(selected);
        await bulkDeleteModifications(bikeId, ids);
        setRecords((prev) => prev.filter((r) => !ids.includes(r.id)));
        setSelected(new Set()); setSelectMode(false);
      }},
    ]);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <View style={st.root}>
      <View style={st.sectionHeader}>
        <Text style={[st.sectionTitle, { color: theme.textSecondary }]}>MODIFICATIONS</Text>
        <View style={st.headerActions}>
          {selectMode && selected.size > 0 && (
            <Pressable onPress={handleBulkDelete} hitSlop={8} style={st.iconBtn}>
              <Feather name="trash-2" size={16} color={theme.red} />
            </Pressable>
          )}
          <Pressable onPress={() => setShowSort(!showSort)} hitSlop={8} style={st.iconBtn}>
            <Feather name="sliders" size={16} color={theme.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setSelectMode(!selectMode)} hitSlop={8} style={st.iconBtn}>
            <Feather name="check-square" size={16} color={selectMode ? theme.red : theme.textSecondary} />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={[st.addBtn, { backgroundColor: theme.red }]}
            onPress={() => { setEditing(null); setShowForm(true); }}
          >
            <Feather name="plus" size={14} color="#fff" />
          </Pressable>
        </View>
      </View>

      {showSort && (
        <View style={[st.sortDropdown, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[st.sortItem, { borderBottomColor: theme.border }, sortKey === opt.key && { backgroundColor: theme.red + '22' }]}
              onPress={() => { setSortKey(opt.key); setShowSort(false); }}
            >
              <Text style={[st.sortItemText, { color: sortKey === opt.key ? theme.red : theme.textPrimary }]}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {selectMode && <Text style={[st.selectCount, { color: theme.textSecondary }]}>{selected.size} selected</Text>}

      {records.length === 0 && (
        <View style={st.emptyState}>
          <Feather name="settings" size={28} color={theme.border} />
          <Text style={[st.emptyText, { color: theme.textSecondary }]}>No modifications recorded yet</Text>
        </View>
      )}

      {sorted.map((record) => (
        <View key={record.id} style={[st.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={st.cardRow}>
            {selectMode && (
              <Pressable onPress={() => toggleSelect(record.id)} style={st.checkbox} hitSlop={8}>
                <Feather name={selected.has(record.id) ? 'check-square' : 'square'} size={18}
                  color={selected.has(record.id) ? theme.red : theme.textSecondary} />
              </Pressable>
            )}
            <View style={st.cardContent}>
              <Text style={[st.cardTitle, { color: theme.textPrimary }]}>{record.title}</Text>
              <Text style={[st.cardMeta, { color: theme.textSecondary }]}>
                {record.category}
                {record.brand ? ` · ${record.brand}` : ''}
                {record.dateInstalled ? ` · ${record.dateInstalled}` : ''}
                {record.cost ? ` · $${record.cost.toFixed(2)}` : ''}
              </Text>
              {record.notes ? <Text style={[st.cardNotes, { color: theme.textMuted }]}>{record.notes}</Text> : null}
            </View>
            {!selectMode && (
              <View style={st.cardActions}>
                <Pressable onPress={() => handleEdit(record)} hitSlop={8} style={st.iconBtn}>
                  <Feather name="edit-2" size={14} color={theme.textSecondary} />
                </Pressable>
                <Pressable onPress={() => handleDelete(record)} hitSlop={8} style={st.iconBtn}>
                  <Feather name="trash-2" size={14} color={theme.textSecondary} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ))}

      <FormModal
        visible={showForm} bikeId={bikeId} editing={editing}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditing(null); }}
      />
    </View>
  );
}

const fm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, padding: 20, paddingBottom: 40, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  heading: { fontSize: 15, fontWeight: '700', letterSpacing: 2 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerList: { borderWidth: 1, borderRadius: 6, marginTop: 4, overflow: 'hidden' },
  pickerItem: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1 },
  pickerItemText: { fontSize: 14 },
  saveBtn: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
});

const st = StyleSheet.create({
  root: { padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 4 },
  addBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sortDropdown: { borderWidth: 1, borderRadius: 6, marginBottom: 8, overflow: 'hidden' },
  sortItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  sortItemText: { fontSize: 13 },
  selectCount: { fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12 },
  checkbox: { marginRight: 10, marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  cardMeta: { fontSize: 11, lineHeight: 16 },
  cardNotes: { fontSize: 11, marginTop: 4, lineHeight: 16, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', gap: 4, marginLeft: 8 },
});
