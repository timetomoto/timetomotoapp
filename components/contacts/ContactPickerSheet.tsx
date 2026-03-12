import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import * as Contacts from 'expo-contacts';
import { useTheme } from '@/lib/useTheme';
import { formatPhoneNumber } from '@/lib/formatPhoneNumber';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhoneEntry {
  label: string;
  number: string;
}

interface PickableContact {
  id: string;
  name: string;
  initials: string;
  imageUri?: string;
  phones: PhoneEntry[];
}

interface Props {
  onSelect: (name: string, phone: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function normaliseLabel(label?: string | null): string {
  if (!label) return '';
  return label.replace(/^_\$!<|>!\$_$/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Contact list item
// ---------------------------------------------------------------------------

interface ContactItemProps {
  contact: PickableContact;
  onPress: (contact: PickableContact) => void;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  bgCard: string;
}

function ContactItem({ contact, onPress, accentColor, textPrimary, textSecondary, borderColor, bgCard }: ContactItemProps) {
  const primaryPhone = contact.phones[0];
  const hasMultiple = contact.phones.length > 1;

  return (
    <Pressable
      style={[styles.contactItem, { borderBottomColor: borderColor }]}
      onPress={() => onPress(contact)}
      accessibilityLabel={`${contact.name}, ${primaryPhone?.number ?? ''}`}
      accessibilityRole="button"
    >
      {/* Avatar */}
      {contact.imageUri ? (
        <Image source={{ uri: contact.imageUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.initialsCircle, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
          <Text style={[styles.initialsText, { color: accentColor }]}>{contact.initials}</Text>
        </View>
      )}

      {/* Name + phone */}
      <View style={styles.contactItemText}>
        <Text style={[styles.contactItemName, { color: textPrimary }]} numberOfLines={1}>{contact.name}</Text>
        {primaryPhone && (
          <Text style={[styles.contactItemPhone, { color: textSecondary }]} numberOfLines={1}>
            {primaryPhone.label ? `${primaryPhone.label}  ` : ''}{primaryPhone.number}
          </Text>
        )}
      </View>

      {hasMultiple && (
        <Feather name="chevron-right" size={16} color={borderColor} />
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Number picker sub-sheet
// ---------------------------------------------------------------------------

interface NumberPickerProps {
  contact: PickableContact;
  onSelect: (phone: string) => void;
  onBack: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
}

function NumberPicker({ contact, onSelect, onBack, theme }: NumberPickerProps) {
  return (
    <View style={styles.numberPickerWrap}>
      <Pressable onPress={onBack} style={styles.numberPickerBack}>
        <Feather name="arrow-left" size={16} color={theme.textSecondary} />
        <Text style={[styles.numberPickerBackText, { color: theme.textSecondary }]}>Back</Text>
      </Pressable>
      <Text style={[styles.numberPickerName, { color: theme.textPrimary }]}>{contact.name}</Text>
      <Text style={[styles.numberPickerHint, { color: theme.textMuted }]}>Choose a phone number</Text>
      {contact.phones.map((p, i) => (
        <Pressable
          key={i}
          style={[styles.numberRow, { borderBottomColor: theme.border }]}
          onPress={() => onSelect(p.number)}
          accessibilityRole="radio"
          accessibilityLabel={`${p.label || 'Phone'} ${p.number}`}
        >
          <View style={styles.numberRowLeft}>
            {p.label ? (
              <Text style={[styles.numberLabel, { color: theme.textSecondary }]}>{p.label}</Text>
            ) : null}
            <Text style={[styles.numberValue, { color: theme.textPrimary }]}>{p.number}</Text>
          </View>
          <Feather name="chevron-right" size={14} color={theme.border} />
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main sheet
// ---------------------------------------------------------------------------

export default function ContactPickerSheet({ onSelect, onClose }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const [contacts, setContacts] = useState<PickableContact[]>([]);
  const [filtered, setFiltered] = useState<PickableContact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [multiContact, setMultiContact] = useState<PickableContact | null>(null);
  const [isLimited, setIsLimited] = useState(false);

  // Slide in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    loadContacts();
  }, []);

  function dismiss(cb?: () => void) {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { onClose(); cb?.(); });
  }

  async function loadContacts() {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status === 'limited') {
        setIsLimited(true);
        // fall through — getContactsAsync still returns the allowed subset
      }

      if (status === 'denied') {
        setLoading(false);
        Alert.alert(
          'Contacts Access Required',
          'To add contacts from your phone, Time to Moto needs access to your contacts. You can enable this in your device Settings.',
          [
            { text: 'Not Now', style: 'cancel', onPress: () => dismiss() },
            { text: 'Open Settings', onPress: () => { Linking.openSettings(); dismiss(); } },
          ],
        );
        return;
      }

      if (status === 'restricted') {
        setLoading(false);
        setEmptyMessage('Contacts access is restricted on this device.');
        return;
      }

      if (status !== 'granted' && status !== 'limited') {
        setLoading(false);
        setEmptyMessage('Contacts permission was not granted.');
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
        sort: Contacts.SortTypes.LastName,
      });

      if (data.length === 0) {
        setEmptyMessage('No contacts found on this device.');
        setLoading(false);
        return;
      }

      const parsed: PickableContact[] = data
        .filter((c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
        .map((c) => ({
          id: c.id ?? c.name ?? Math.random().toString(),
          name: c.name!,
          initials: getInitials(c.name!),
          imageUri: c.imageAvailable && c.image?.uri ? c.image.uri : undefined,
          phones: (c.phoneNumbers ?? []).map((p) => ({
            label: normaliseLabel(p.label),
            number: formatPhoneNumber(p.number ?? ''),
          })),
        }));

      if (parsed.length === 0) {
        setEmptyMessage('No contacts with phone numbers were found.');
        setLoading(false);
        return;
      }

      setContacts(parsed);
      setFiltered(parsed);
    } catch {
      setEmptyMessage('Could not load contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Filter in memory as search changes
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(contacts);
    } else {
      const q = search.toLowerCase();
      setFiltered(contacts.filter((c) => c.name.toLowerCase().includes(q)));
    }
  }, [search, contacts]);

  function handleContactPress(contact: PickableContact) {
    if (contact.phones.length > 1) {
      setMultiContact(contact);
    } else {
      confirmSelect(contact.name, contact.phones[0].number);
    }
  }

  function confirmSelect(name: string, phone: string) {
    dismiss(() => onSelect(name, phone));
  }

  return (
    <Modal transparent animationType="none" onRequestClose={() => dismiss()}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableWithoutFeedback onPress={() => dismiss()}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bgPanel,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + 8,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={[styles.handleBar, { backgroundColor: theme.border }]} />

        {/* Header */}
        <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Select a Contact</Text>
          <Pressable onPress={() => dismiss()} style={styles.closeBtn} accessibilityLabel="Close contact picker">
            <Feather name="x" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { borderBottomColor: theme.border }]}>
          <Feather name="search" size={15} color={theme.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: theme.textPrimary }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts..."
            placeholderTextColor={theme.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityHint="Search your contacts by name"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x-circle" size={15} color={theme.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Body */}
        {multiContact ? (
          <NumberPicker
            contact={multiContact}
            onSelect={(phone) => confirmSelect(multiContact.name, phone)}
            onBack={() => setMultiContact(null)}
            theme={theme}
          />
        ) : loading ? (
          <View style={styles.centerState}>
            <Text style={[styles.stateText, { color: theme.textMuted }]}>Loading contacts…</Text>
          </View>
        ) : emptyMessage ? (
          <View style={styles.centerState}>
            <Feather name="users" size={32} color={theme.border} />
            <Text style={[styles.stateText, { color: theme.textSecondary }]}>{emptyMessage}</Text>
          </View>
        ) : (
          <FlashList
            data={filtered}
            estimatedItemSize={64}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ContactItem
                contact={item}
                onPress={handleContactPress}
                accentColor={theme.red}
                textPrimary={theme.textPrimary}
                textSecondary={theme.textSecondary}
                borderColor={theme.border}
                bgCard={theme.bgCard}
              />
            )}
            ListHeaderComponent={isLimited ? (
              <Pressable
                style={[styles.limitedBanner, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                onPress={() => Linking.openSettings()}
                accessibilityRole="button"
                accessibilityLabel="Open Settings to allow more contacts"
              >
                <Feather name="info" size={14} color={theme.textSecondary} style={styles.limitedBannerIcon} />
                <View style={styles.limitedBannerText}>
                  <Text style={[styles.limitedBannerTitle, { color: theme.textPrimary }]}>Showing limited contacts</Text>
                  <Text style={[styles.limitedBannerHint, { color: theme.textSecondary }]}>
                    Tap to open Settings and allow access to more contacts.
                  </Text>
                </View>
                <Feather name="chevron-right" size={14} color={theme.border} />
              </Pressable>
            ) : null}
            ListEmptyComponent={
              <View style={styles.centerState}>
                <Text style={[styles.stateText, { color: theme.textSecondary }]}>No contacts match "{search}"</Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    maxHeight: '88%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 0 : 2,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  initialsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initialsText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  contactItemText: {
    flex: 1,
    gap: 2,
  },
  contactItemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  contactItemPhone: {
    fontSize: 12,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    gap: 12,
    paddingHorizontal: 32,
  },
  stateText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Limited contacts banner
  limitedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  limitedBannerIcon: { flexShrink: 0 },
  limitedBannerText: { flex: 1, gap: 2 },
  limitedBannerTitle: { fontSize: 13, fontWeight: '600' },
  limitedBannerHint: { fontSize: 12, lineHeight: 17 },

  // Number picker
  numberPickerWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  numberPickerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 8,
  },
  numberPickerBackText: {
    fontSize: 14,
  },
  numberPickerName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  numberPickerHint: {
    fontSize: 13,
    marginBottom: 16,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  numberRowLeft: {
    gap: 3,
  },
  numberLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'capitalize',
  },
  numberValue: {
    fontSize: 15,
  },
});
