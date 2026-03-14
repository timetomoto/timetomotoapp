import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';
import { useTheme } from '@/lib/useTheme';
import {
  loadFavorites,
  removeFavorite,
  type FavoriteLocation,
} from '@/lib/favorites';

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>{label}</Text>
  );
}

// ---------------------------------------------------------------------------
// Row divider
// ---------------------------------------------------------------------------

function Divider() {
  const { theme } = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

// ---------------------------------------------------------------------------
// Setting row (pressable)
// ---------------------------------------------------------------------------

function SettingRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[styles.settingRow, { borderBottomColor: theme.border }]}
      onPress={onPress}
    >
      <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>{label}</Text>
      <Feather name="chevron-right" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Toggle row
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={value ? theme.red : theme.textMuted}
        trackColor={{ false: theme.border, true: theme.red + '66' }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Change Password inline form
// ---------------------------------------------------------------------------

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { theme } = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!newPassword || !confirmPassword) {
      setError('Both fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(onDone, 800);
    }
  }

  return (
    <View style={[styles.inlineForm, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        placeholder="New password"
        placeholderTextColor={theme.inputPlaceholder}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <TextInput
        style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
        placeholder="Confirm new password"
        placeholderTextColor={theme.inputPlaceholder}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      {!!error && <Text style={[styles.errorText, { color: theme.red }]}>{error}</Text>}
      {success && <Text style={styles.successText}>Password updated!</Text>}
      <View style={styles.inlineFormBtns}>
        <Pressable style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onDone}>
          <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>CANCEL</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.red }]}
          onPress={handleSave}
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
// Main screen
// ---------------------------------------------------------------------------

export default function AccountScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [shareRideData, setShareRideData] = useState(false);
  const [defaultLocationSharing, setDefaultLocationSharing] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [favLocations, setFavLocations] = useState<FavoriteLocation[]>([]);
  const userId = user?.id ?? 'local';

  useEffect(() => {
    if (user?.user_metadata) {
      setDisplayName(user.user_metadata.display_name ?? '');
      setPhone(user.user_metadata.phone ?? '');
    }
  }, [user]);

  useEffect(() => {
    loadFavorites(userId).then(setFavLocations);
  }, [userId]);

  async function handleRemoveFavorite(fav: FavoriteLocation) {
    Alert.alert(
      'Remove Favorite',
      `Remove "${fav.name}" from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = await removeFavorite(fav, userId);
            setFavLocations(updated);
          },
        },
      ],
    );
  }

  async function handleSaveProfile() {
    setProfileError(null);
    setProfileSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName, phone },
    });
    setProfileSaving(false);
    if (error) {
      setProfileError(error.message);
    } else {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
  }

  async function handleResetPassword() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Check your email', 'A password reset link has been sent to ' + user.email);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>MY ACCOUNT</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* PROFILE */}
        <SectionHeader label="PROFILE" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>EMAIL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
            value={user?.email ?? ''}
            editable={false}
            placeholderTextColor={theme.inputPlaceholder}
          />
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>DISPLAY NAME</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
            value={displayName}
            onChangeText={(t) => { setDisplayName(t); setProfileSaved(false); }}
            placeholder="Your name"
            placeholderTextColor={theme.inputPlaceholder}
            autoCapitalize="words"
          />
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PHONE NUMBER</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.inputBorder, color: theme.textPrimary }]}
            value={phone}
            onChangeText={(t) => { setPhone(t); setProfileSaved(false); }}
            placeholder="+1 555 000 0000"
            placeholderTextColor={theme.inputPlaceholder}
            keyboardType="phone-pad"
          />
          {!!profileError && <Text style={[styles.errorText, { color: theme.red }]}>{profileError}</Text>}
          {profileSaved && <Text style={styles.successText}>Profile saved!</Text>}
          <Pressable
            style={[styles.saveBtn, { backgroundColor: theme.red }]}
            onPress={handleSaveProfile}
            disabled={profileSaving}
          >
            {profileSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>SAVE PROFILE</Text>
            }
          </Pressable>
        </View>

        {/* SECURITY */}
        <SectionHeader label="SECURITY" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <SettingRow
            label="Change Password"
            onPress={() => setShowChangePassword((v) => !v)}
          />
          {showChangePassword && (
            <ChangePasswordForm onDone={() => setShowChangePassword(false)} />
          )}
          <Divider />
          <SettingRow label="Reset Password via Email" onPress={handleResetPassword} />
        </View>

        {/* PRIVACY */}
        <SectionHeader label="PRIVACY" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <ToggleRow
            label="Share ride data"
            value={shareRideData}
            onValueChange={setShareRideData}
          />
          <ToggleRow
            label="Default location sharing"
            value={defaultLocationSharing}
            onValueChange={setDefaultLocationSharing}
          />
        </View>

        {/* FAVORITE LOCATIONS */}
        <SectionHeader label="FAVORITE LOCATIONS" />
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {favLocations.length === 0 ? (
            <View style={styles.favEmpty}>
              <Ionicons name="heart-outline" size={20} color={theme.textMuted} />
              <Text style={[styles.favEmptyText, { color: theme.textMuted }]}>
                No favorite locations saved yet.
              </Text>
            </View>
          ) : (
            favLocations.map((fav, i) => {
              const isLast = i === favLocations.length - 1;
              return (
                <View
                  key={`${fav.name}-${fav.lat}-${fav.lng}`}
                  style={[
                    styles.settingRow,
                    { borderBottomColor: theme.border },
                    isLast && { borderBottomWidth: 0 },
                  ]}
                >
                  <Ionicons name="heart" size={16} color={theme.red} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>{fav.name}</Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                      {fav.lat.toFixed(3)}, {fav.lng.toFixed(3)}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleRemoveFavorite(fav)} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
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
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 4,
  },

  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: 'BarlowCondensed',
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },

  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },

  fieldLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
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

  divider: { height: 1, marginVertical: 4 },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },

  inlineForm: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
    marginTop: 8,
  },
  inlineFormBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
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
    letterSpacing: 1.5,
  },

  saveBtn: {
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },

  errorText: { fontSize: 13, textAlign: 'center' },
  successText: { color: '#4CAF50', fontSize: 13, textAlign: 'center' },

  favEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  favEmptyText: {
    fontSize: 13,
  },
});
