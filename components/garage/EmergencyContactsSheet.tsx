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
import { Colors } from '../../lib/theme';

const SHEET_HEIGHT = 520;
const MAX_CONTACTS = 3;

interface Props {
  onClose: () => void;
}

export default function EmergencyContactsSheet({ onClose }: Props) {
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

  // Slide in
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }),
    ]).start();

    // Load latest from DB
    if (user) loadContacts(user.id);
  }, []);

  // Sync store → local state when loaded
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
    if (!user) return;
    Keyboard.dismiss();

    // Validate
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
    const err = await saveContacts(user.id, filled);
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
          { paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.handleBar} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.heading}>EMERGENCY CONTACTS</Text>
                <Text style={styles.subHeading}>Notified if a crash is detected</Text>
              </View>
              <Pressable onPress={handleClose} style={styles.closeBtn}>
                <Feather name="x" size={18} color={Colors.TEXT_SECONDARY} />
              </Pressable>
            </View>

            {contacts.map((c, i) => (
              <View key={i} style={styles.contactCard}>
                <View style={styles.contactCardHeader}>
                  <Text style={styles.contactNum}>CONTACT {i + 1}</Text>
                  {contacts.length > 1 && (
                    <Pressable onPress={() => removeContact(i)} hitSlop={8}>
                      <Feather name="trash-2" size={14} color={Colors.TEXT_SECONDARY} />
                    </Pressable>
                  )}
                </View>
                <Text style={styles.fieldLabel}>NAME</Text>
                <TextInput
                  style={styles.input}
                  value={c.name}
                  onChangeText={(t) => updateContact(i, 'name', t)}
                  placeholder="e.g. Jane Doe"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  autoCorrect={false}
                  autoCapitalize="words"
                />
                <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
                <TextInput
                  style={styles.input}
                  value={c.phone}
                  onChangeText={(t) => updateContact(i, 'phone', t)}
                  placeholder="e.g. +1 512 555 0100"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
            ))}

            {contacts.length < MAX_CONTACTS && (
              <Pressable style={styles.addContactBtn} onPress={addContact}>
                <Feather name="plus" size={14} color={Colors.TEXT_SECONDARY} />
                <Text style={styles.addContactText}>ADD ANOTHER CONTACT</Text>
              </Pressable>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {saved && <Text style={styles.savedText}>Contacts saved!</Text>}

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
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
    backgroundColor: Colors.TTM_PANEL,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: Colors.TTM_BORDER,
    maxHeight: '90%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.TTM_BORDER,
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
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
  },
  subHeading: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    marginTop: 4,
  },
  closeBtn: { padding: 4 },

  contactCard: {
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
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
    color: Colors.TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  fieldLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.TTM_PANEL,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
  },

  addContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginBottom: 12,
  },
  addContactText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },

  errorText: { color: Colors.TTM_RED, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  savedText:  { color: '#4CAF50',     fontSize: 13, marginBottom: 12, textAlign: 'center' },

  saveBtn: {
    backgroundColor: Colors.TTM_RED,
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
    letterSpacing: 2,
  },
});
