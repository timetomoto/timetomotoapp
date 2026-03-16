import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore, useSafetyStore, type EmergencyContact } from '@/lib/store';
import { useTheme } from '@/lib/useTheme';
import ContactPickerSheet from '@/components/contacts/ContactPickerSheet';

const MAX_CONTACTS = 3;

// ---------------------------------------------------------------------------
// Contact form (inline)
// ---------------------------------------------------------------------------

interface ContactFormData {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

interface ContactFormProps {
  index: number;
  data: ContactFormData;
  onChange: (index: number, field: keyof ContactFormData, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

function ContactForm({ index, data, onChange, onCancel, onSave, saving }: ContactFormProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <Text style={[styles.formTitle, { color: theme.textSecondary }]}>
        {index === 0 ? 'EDIT PRIMARY CONTACT' : `EDIT CONTACT ${index + 1}`}
      </Text>

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>NAME *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.name}
        onChangeText={(t) => onChange(index, 'name', t)}
        placeholder="Full name"
        placeholderTextColor={theme.inputPlaceholder}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>RELATIONSHIP</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.relationship}
        onChangeText={(t) => onChange(index, 'relationship', t)}
        placeholder="e.g. Spouse, Friend, Parent"
        placeholderTextColor={theme.inputPlaceholder}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PHONE NUMBER *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.phone}
        onChangeText={(t) => onChange(index, 'phone', t)}
        placeholder="+1 555 000 0000"
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType="phone-pad"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>EMAIL (OPTIONAL)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.email}
        onChangeText={(t) => onChange(index, 'email', t)}
        placeholder="email@example.com"
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.formBtns}>
        <Pressable style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onCancel}>
          <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.red }]}
          onPress={onSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>SAVE</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Add contact form
// ---------------------------------------------------------------------------

interface AddContactFormProps {
  onSave: (data: ContactFormData) => void;
  onCancel: () => void;
  saving: boolean;
  prefill?: Partial<ContactFormData>;
  error?: string | null;
  onClearError?: () => void;
}

function AddContactForm({ onSave, onCancel, saving, prefill, error, onClearError }: AddContactFormProps) {
  const { theme } = useTheme();
  const [data, setData] = useState<ContactFormData>({
    name: prefill?.name ?? '',
    relationship: prefill?.relationship ?? '',
    phone: prefill?.phone ?? '',
    email: prefill?.email ?? '',
  });

  function update(field: keyof ContactFormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <View style={[styles.formCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <Text style={[styles.formTitle, { color: theme.textSecondary }]}>NEW CONTACT</Text>

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>NAME *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.name}
        onChangeText={(t) => update('name', t)}
        placeholder="Full name"
        placeholderTextColor={theme.inputPlaceholder}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>RELATIONSHIP</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.relationship}
        onChangeText={(t) => update('relationship', t)}
        placeholder="e.g. Spouse, Friend, Parent"
        placeholderTextColor={theme.inputPlaceholder}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PHONE NUMBER *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.phone}
        onChangeText={(t) => update('phone', t)}
        placeholder="+1 555 000 0000"
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType="phone-pad"
        autoCorrect={false}
      />

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>EMAIL (OPTIONAL)</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        value={data.email}
        onChangeText={(t) => update('email', t)}
        placeholder="email@example.com"
        placeholderTextColor={theme.inputPlaceholder}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {!!error && (
        <Text style={[styles.formErrorText, { color: theme.red }]}>{error}</Text>
      )}

      <View style={styles.formBtns}>
        <Pressable style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={() => { onClearError?.(); onCancel(); }}>
          <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.red }]}
          onPress={() => onSave(data)}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>ADD</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contact card (display)
// ---------------------------------------------------------------------------

interface ContactCardProps {
  contact: EmergencyContact;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

function ContactCard({ contact, index, onEdit, onDelete }: ContactCardProps) {
  const { theme } = useTheme();
  const isPrimary = index === 0;

  return (
    <View style={[styles.contactCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <View style={styles.contactCardTop}>
        <View style={styles.contactCardLeft}>
          {isPrimary && (
            <View style={[styles.primaryBadge, { backgroundColor: theme.red + '22', borderColor: theme.red + '55' }]}>
              <Text style={[styles.primaryBadgeText, { color: theme.red }]}>PRIMARY</Text>
            </View>
          )}
          <Text style={[styles.contactName, { color: theme.textPrimary }]}>{contact.name}</Text>
          {!!contact.relationship && (
            <Text style={[styles.contactRelationship, { color: theme.textSecondary }]}>{contact.relationship}</Text>
          )}
          <Text style={[styles.contactPhone, { color: theme.textSecondary }]}>{contact.phone}</Text>
          {!!contact.email && (
            <Text style={[styles.contactEmail, { color: theme.textMuted }]}>{contact.email}</Text>
          )}
        </View>
        <View style={styles.contactCardActions}>
          <Pressable
            style={[styles.iconBtn, { borderColor: theme.border }]}
            onPress={onEdit}
            hitSlop={6}
            accessibilityLabel="Edit contact"
          >
            <Feather name="edit-2" size={14} color={theme.textSecondary} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { borderColor: theme.border }]}
            onPress={onDelete}
            hitSlop={6}
            accessibilityLabel="Delete contact"
          >
            <Feather name="trash-2" size={14} color={theme.red} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function EmergencyContactsScreen() {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const { user } = useAuthStore();
  const { emergencyContacts, loadContacts, saveContacts } = useSafetyStore();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForms, setEditForms] = useState<ContactFormData[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormPrefill, setAddFormPrefill] = useState<Partial<ContactFormData> | undefined>();
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts(user?.id ?? 'local');
  }, [user]);

  useEffect(() => {
    setContacts([...emergencyContacts]);
    setEditForms(
      emergencyContacts.map((c: EmergencyContact) => ({
        name: c.name ?? '',
        relationship: c.relationship ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
      })),
    );
  }, [emergencyContacts]);

  function handleEditChange(index: number, field: keyof ContactFormData, value: string) {
    setEditForms((prev) => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  }

  async function handleSaveEdit(index: number) {
    const form = editForms[index];
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError(`"${form.name}" has an invalid phone number.`);
      return;
    }
    setError(null);
    setSaving(true);
    const updated = contacts.map((c, i) =>
      i === index ? { ...c, ...form } as EmergencyContact : c,
    );
    const err = await saveContacts(user?.id ?? 'local', updated);
    setSaving(false);
    if (err) {
      setError(err);
    } else {
      setEditingIndex(null);
    }
  }

  function handleDeleteContact(index: number) {
    const contact = contacts[index];
    Alert.alert(
      'REMOVE CONTACT',
      `Remove ${contact.name} from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const updated = contacts.filter((_, i) => i !== index);
            const err = await saveContacts(user?.id ?? 'local', updated);
            setSaving(false);
            if (err) setError(err);
          },
        },
      ],
    );
  }

  async function handleAddContact(data: ContactFormData) {
    if (!data.name.trim() || !data.phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    const digits = data.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError(`"${data.name}" has an invalid phone number.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const newContact: EmergencyContact = { name: data.name, relationship: data.relationship, phone: data.phone, email: data.email };
      const updated = [...contacts, newContact];
      const err = await saveContacts(user?.id ?? 'local', updated);
      if (err) {
        setError(err);
      } else {
        setShowAddForm(false);
        setAddFormPrefill(undefined);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save contact.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>EMERGENCY CONTACTS</Text>
        {contacts.length < MAX_CONTACTS ? (
          <Pressable
            style={styles.backBtn}
            onPress={() => { setShowAddForm(false); setAddFormPrefill(undefined); setShowPicker(true); }}
            hitSlop={8}
            accessibilityLabel="Add contact from phone"
          >
            <Feather name="user-plus" size={20} color={theme.red} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          These contacts are notified if a crash is detected or a check-in expires.
        </Text>


        {contacts.length < MAX_CONTACTS && (
          <View style={[styles.addBtnRow, screenWidth < 380 && styles.addBtnRowStacked]}>
            <Pressable
              style={[styles.addBtnOutlined, { borderColor: theme.red }]}
              onPress={() => { setShowAddForm(false); setAddFormPrefill(undefined); setShowPicker(true); }}
              accessibilityLabel="Add contact from phone directory"
            >
              <Feather name="book-open" size={14} color={theme.red} />
              <Text style={[styles.addBtnOutlinedText, { color: theme.red }]}>FROM PHONE</Text>
            </Pressable>
            <Pressable
              style={[styles.addBtnFilled, { backgroundColor: showAddForm ? theme.bgCard : theme.red }]}
              onPress={() => { setAddFormPrefill(undefined); setShowAddForm(true); }}
              accessibilityLabel="Add contact manually"
            >
              <Feather name="plus" size={14} color={showAddForm ? theme.textSecondary : '#fff'} />
              <Text style={[styles.addBtnFilledText, showAddForm && { color: theme.textSecondary }]}>ADD MANUALLY</Text>
            </Pressable>
          </View>
        )}

        {contacts.length === 0 && !showAddForm && (
          <View style={[styles.emptyState, { borderColor: theme.border }]}>
            <Feather name="shield-off" size={36} color={theme.border} />
            <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No contacts yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
              Add an emergency contact to receive crash alerts.
            </Text>
          </View>
        )}

        {contacts.map((contact, index) => (
          <View key={index}>
            {editingIndex === index ? (
              <ContactForm
                index={index}
                data={editForms[index] ?? { name: '', relationship: '', phone: '', email: '' }}
                onChange={handleEditChange}
                onCancel={() => setEditingIndex(null)}
                onSave={() => handleSaveEdit(index)}
                saving={saving}
              />
            ) : (
              <ContactCard
                contact={contact}
                index={index}
                onEdit={() => setEditingIndex(index)}
                onDelete={() => handleDeleteContact(index)}
              />
            )}
          </View>
        ))}

        {showAddForm && (
          <AddContactForm
            onSave={handleAddContact}
            onCancel={() => { setShowAddForm(false); setAddFormPrefill(undefined); setError(null); }}
            saving={saving}
            prefill={addFormPrefill}
            error={error}
            onClearError={() => setError(null)}
          />
        )}

        {showPicker && (
          <ContactPickerSheet
            onClose={() => setShowPicker(false)}
            onSelect={(name, phone) => {
              setAddFormPrefill({ name, phone });
              setShowAddForm(true);
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 12,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },

  errorText: { fontSize: 13, textAlign: 'center' },
  formErrorText: { fontSize: 13, textAlign: 'center', marginTop: 4 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  contactCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  contactCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  contactCardLeft: {
    flex: 1,
    gap: 3,
  },
  primaryBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  contactRelationship: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  contactPhone: {
    fontSize: 14,
    marginTop: 2,
  },
  contactEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  contactCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
  iconBtn: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },

  formCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  formTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  formBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  saveBtn: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  addBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addBtnRowStacked: {
    flexDirection: 'column',
  },
  addBtnOutlined: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
  },
  addBtnOutlinedText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  addBtnFilled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    paddingVertical: 14,
  },
  addBtnFilledText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
