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
  loadMaintenance,
  addMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  generateId,
  MAINTENANCE_TYPES,
  type MaintenanceRecord,
} from '../../lib/garage';
import DatePickerField, { formatDisplayDate } from './DatePickerField';

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

type SortKey = 'date_desc' | 'date_asc' | 'title_asc' | 'title_desc';

function sortRecords(records: MaintenanceRecord[], key: SortKey): MaintenanceRecord[] {
  const copy = [...records];
  switch (key) {
    case 'date_desc': return copy.sort((a, b) => b.date.localeCompare(a.date));
    case 'date_asc':  return copy.sort((a, b) => a.date.localeCompare(b.date));
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

// ---------------------------------------------------------------------------
// Form Modal
// ---------------------------------------------------------------------------

interface FormModalProps {
  visible: boolean;
  bikeId: string;
  editing: MaintenanceRecord | null;
  onSave: (r: MaintenanceRecord) => void;
  onClose: () => void;
}

function FormModal({ visible, bikeId, editing, onSave, onClose }: FormModalProps) {
  const { theme } = useTheme();
  const now = new Date().toISOString().split('T')[0];

  const [title, setTitle]               = useState('');
  const [maintenanceType, setType]      = useState(MAINTENANCE_TYPES[0]);
  const [date, setDate]                 = useState(now);
  const [mileage, setMileage]           = useState('');
  const [cost, setCost]                 = useState('');
  const [notes, setNotes]               = useState('');
  const [showTypePicker, setShowTypePicker] = useState(false);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setType(editing.maintenanceType);
      setDate(editing.date);
      setMileage(editing.mileage ? String(editing.mileage) : '');
      setCost(editing.cost ? String(editing.cost) : '');
      setNotes(editing.notes ?? '');
    } else {
      setTitle('');
      setType(MAINTENANCE_TYPES[0]);
      setDate(now);
      setMileage('');
      setCost('');
      setNotes('');
    }
  }, [editing, visible]);

  function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now2 = new Date().toISOString();
    const record: MaintenanceRecord = {
      id: editing?.id ?? generateId(),
      bikeId,
      title: trimmed,
      maintenanceType,
      date,
      mileage: mileage ? parseFloat(mileage) : undefined,
      cost: cost ? parseFloat(cost) : undefined,
      notes: notes.trim() || undefined,
      createdAt: editing?.createdAt ?? now2,
      updatedAt: now2,
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
            <Text style={[fm.heading, { color: theme.textPrimary }]}>{editing ? 'EDIT RECORD' : 'ADD RECORD'}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={theme.textSecondary} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[fm.label, { color: theme.textSecondary }]}>TITLE</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Oil change at 12k"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>TYPE</Text>
            <Pressable
              style={[fm.input, fm.pickerBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
              onPress={() => setShowTypePicker(true)}
            >
              <Text style={[{ color: theme.textPrimary }]}>{maintenanceType}</Text>
              <Feather name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>

            {showTypePicker && (
              <View style={[fm.pickerList, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
                  {MAINTENANCE_TYPES.map((t) => (
                    <Pressable
                      key={t}
                      style={[fm.pickerItem, { borderBottomColor: theme.border }, t === maintenanceType && { backgroundColor: theme.red + '22' }]}
                      onPress={() => { setType(t); setShowTypePicker(false); }}
                    >
                      <Text style={[fm.pickerItemText, { color: t === maintenanceType ? theme.red : theme.textPrimary }]}>{t}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={[fm.label, { color: theme.textSecondary }]}>DATE</Text>
            <DatePickerField value={date} onChange={setDate} />

            <Text style={[fm.label, { color: theme.textSecondary }]}>MILEAGE (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={mileage}
              onChangeText={setMileage}
              placeholder="e.g. 12000"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>COST (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={cost}
              onChangeText={setCost}
              placeholder="e.g. 85.00"
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={[fm.label, { color: theme.textSecondary }]}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[fm.input, fm.textArea, { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional details…"
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={3}
            />

            <Pressable
              style={[fm.saveBtn, { backgroundColor: theme.red }, !title.trim() && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!title.trim()}
            >
              <Text style={fm.saveBtnText}>SAVE</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// MaintenanceSection
// ---------------------------------------------------------------------------

export default function MaintenanceSection({ bikeId, userId }: { bikeId: string; userId?: string }) {
  const { theme } = useTheme();
  const [records, setRecords]     = useState<MaintenanceRecord[]>([]);
  const [sortKey, setSortKey]     = useState<SortKey>('date_desc');
  const [showSort, setShowSort]   = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<MaintenanceRecord | null>(null);

  useEffect(() => {
    loadMaintenance(bikeId, userId).then(setRecords);
  }, [bikeId]);

  const sorted = sortRecords(records, sortKey);

  async function handleSave(record: MaintenanceRecord) {
    if (editing) {
      await updateMaintenanceRecord(bikeId, record, userId);
      setRecords((prev) => prev.map((r) => r.id === record.id ? record : r));
    } else {
      await addMaintenanceRecord(bikeId, record, userId);
      setRecords((prev) => [record, ...prev]);
    }
    setEditing(null);
  }

  function handleEdit(r: MaintenanceRecord) {
    setEditing(r);
    setShowForm(true);
  }

  function handleDelete(r: MaintenanceRecord) {
    Alert.alert('Delete Record?', `Delete "${r.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteMaintenanceRecord(bikeId, r.id, userId);
          setRecords((prev) => prev.filter((x) => x.id !== r.id));
        },
      },
    ]);
  }

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.sectionHeader}>
        <Text style={[st.sectionTitle, { color: theme.textSecondary }]}>MAINTENANCE</Text>
        <View style={st.headerActions}>
          <Pressable onPress={() => setShowSort(!showSort)} hitSlop={8} style={st.iconBtn}>
            <Feather name="sliders" size={16} color={theme.textSecondary} />
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

      {/* Sort dropdown */}
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

      {/* Empty state */}
      {records.length === 0 && (
        <View style={st.emptyState}>
          <Feather name="tool" size={28} color={theme.border} />
          <Text style={[st.emptyText, { color: theme.textSecondary }]}>Start tracking maintenance history.</Text>
        </View>
      )}

      {/* Records */}
      {sorted.map((record) => (
        <View key={record.id} style={[st.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={st.cardRow}>
            <View style={st.cardContent}>
              <Text style={[st.cardTitle, { color: theme.textPrimary }]}>{record.title}</Text>
              <Text style={[st.cardMeta, { color: theme.textSecondary }]}>
                {record.maintenanceType} · {formatDisplayDate(record.date)}
                {record.mileage ? ` · ${record.mileage.toLocaleString()} mi` : ''}
                {record.cost ? ` · $${record.cost.toFixed(2)}` : ''}
              </Text>
              {record.notes ? <Text style={[st.cardNotes, { color: theme.textMuted }]}>{record.notes}</Text> : null}
            </View>
            <View style={st.cardActions}>
              <Pressable onPress={() => handleEdit(record)} hitSlop={8} style={st.iconBtn}>
                <Feather name="edit-2" size={14} color={theme.textSecondary} />
              </Pressable>
              <Pressable onPress={() => handleDelete(record)} hitSlop={8} style={st.iconBtn}>
                <Feather name="trash-2" size={14} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
        </View>
      ))}

      <FormModal
        visible={showForm}
        bikeId={bikeId}
        editing={editing}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditing(null); }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const fm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  heading: { fontSize: 15, fontWeight: '700', letterSpacing: 0.7 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7, marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerList: { borderWidth: 1, borderRadius: 6, marginTop: 4, overflow: 'hidden' },
  pickerItem: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1 },
  pickerItemText: { fontSize: 14 },
  saveBtn: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.7 },
});

const st = StyleSheet.create({
  root: { padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 4 },
  addBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sortDropdown: { borderWidth: 1, borderRadius: 6, marginBottom: 8, overflow: 'hidden' },
  sortItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  sortItemText: { fontSize: 13 },
  selectCount: { fontSize: 11, letterSpacing: 0.3, marginBottom: 8 },
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
