import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, useSafetyStore, type EmergencyContact } from '../../lib/store';
import { useTheme } from '../../lib/useTheme';

const SHEET_HEIGHT = 520;
const MAX_CONTACTS = 3;

interface Props {
  onClose: () => void;
}

export default function EmergencyContactsSheet({ onClose }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const { user } = useAuthStore();
  const { emergencyContacts, loadContacts, saveContacts } = useSafetyStore();

  const [contacts, setContacts] = useState<EmergencyContact[]>(
    emergencyContacts.length > 0 ? [...emergencyContacts] : [{ name: '', phone: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }),
    ]).start();

    loadContacts(user?.id ?? 'local');
  }, []);

  useEffect(() => {
    if (emergencyContacts.length > 0) {
      setContacts([...emergencyContacts]);
    }
  }, [emergencyContacts]);

  function handleClose() {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 250, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  }

  function updateContact(i: number, field: keyof EmergencyContact, val: string) {
    setContacts((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
    setSaved(false);
    setError(null);
  }

  function addContact() {
    if (contacts.length >= MAX_CONTACTS) return;
    setContacts((prev) => [...prev, { name: '', phone: '' }]);
  }

  function removeContact(i: number) {
    setContacts((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    Keyboard.dismiss();

    const filled = contacts.filter((c) => c.name.trim() && c.phone.trim());
    if (filled.length === 0) {
      setError('Add at least one contact with a name and phone number.');
      return;
    }
    for (const c of filled) {
      const digits = c.phone.replace(/\D/g, '');
      if (digits.length < 10) {
        setError(`"${c.name}" has an invalid phone number.`);
        return;
      }
    }

    setError(null);
    setSaving(true);
    const err = await saveContacts(user?.id ?? 'local', filled);
    setSaving(false);
    if (err) { setError(err); return; }
    setSaved(true);
    setTimeout(handleClose, 800);
  }

  return (
    <Modal transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bgPanel,
            borderColor: theme.border,
            paddingBottom: insets.bottom + 16,
          },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={[styles.handleBar, { backgroundColor: theme.border }]} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={[styles.heading, { color: theme.textPrimary }]}>EMERGENCY CONTACTS</Text>
                <Text style={[styles.subHeading, { color: theme.textSecondary }]}>Notified if a crash is detected</Text>
              </View>
              <Pressable onPress={handleClose} style={styles.closeBtn}>
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            {contacts.map((c, i) => (
              <View key={i} style={[styles.contactCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <View style={styles.contactCardHeader}>
                  <Text style={[styles.contactNum, { color: theme.textSecondary }]}>CONTACT {i + 1}</Text>
                  {contacts.length > 1 && (
                    <Pressable onPress={() => removeContact(i)} hitSlop={8}>
                      <Feather name="trash-2" size={14} color={theme.textSecondary} />
                    </Pressable>
                  )}
                </View>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>NAME</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.border, color: theme.textPrimary }]}
                  value={c.name}
                  onChangeText={(t) => updateContact(i, 'name', t)}
                  placeholder="e.g. Jane Doe"
                  placeholderTextColor={theme.textSecondary}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PHONE NUMBER</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.border, color: theme.textPrimary }]}
                  value={c.phone}
                  onChangeText={(t) => updateContact(i, 'phone', t)}
                  placeholder="e.g. +1 512 555 0100"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
            ))}

            {contacts.length < MAX_CONTACTS && (
              <Pressable
                style={[styles.addContactBtn, { borderColor: theme.border }]}
                onPress={addContact}
              >
                <Feather name="plus" size={14} color={theme.textSecondary} />
                <Text style={[styles.addContactText, { color: theme.textSecondary }]}>ADD ANOTHER CONTACT</Text>
              </Pressable>
            )}

            {!!error && <Text style={[styles.errorText, { color: theme.red }]}>{error}</Text>}
            {saved && <Text style={styles.savedText}>Contacts saved!</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.red },
                pressed && styles.saveBtnPressed,
                saving && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>SAVE CONTACTS</Text>
              }
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginBottom: 4,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2.1,
  },
  subHeading: {
    fontSize: 12,
    marginTop: 4,
  },
  closeBtn: { padding: 4 },

  contactCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  contactCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactNum: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },

  addContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginBottom: 12,
  },
  addContactText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },

  errorText: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
  savedText:  { color: '#4CAF50', fontSize: 13, marginBottom: 12, textAlign: 'center' },

  saveBtn: {
    borderRadius: 6,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnPressed:  { opacity: 0.8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});
