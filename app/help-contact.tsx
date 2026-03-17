import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useTheme } from '@/lib/useTheme';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const { theme } = useTheme();
  return (
    <Text style={[styles.label, { color: theme.textSecondary }]}>
      {label}{required ? ' *' : ''}
    </Text>
  );
}

function StyledInput(props: React.ComponentProps<typeof TextInput> & { error?: boolean }) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const { error: hasError, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={theme.textMuted}
      {...rest}
      style={[
        styles.input,
        { backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textPrimary },
        focused && { borderColor: theme.red },
        hasError && { borderColor: '#FF6B35' },
        rest.style,
      ]}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
    />
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type ScreenState = 'form' | 'success' | 'error';

export default function HelpContactScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuthStore();

  const [name, setName]               = useState(
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || '',
  );
  const [email, setEmail]             = useState(user?.email ?? '');
  const [phone, setPhone]             = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>('form');
  const [errorMsg, setErrorMsg]       = useState('');

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim())        errs.name = 'Name is required.';
    if (!email.trim())       errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Invalid email.';
    if (!description.trim()) errs.description = 'Description is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Try edge function first
      const { error } = await supabase.functions.invoke('send-support-email', {
        body: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          description: description.trim(),
          timestamp: new Date().toISOString(),
          appVersion: '1.0.0',
          deviceInfo: Platform.OS,
        },
      });

      if (!error) {
        setScreenState('success');
        return;
      }
    } catch {
      // Edge function unavailable — fall through to mailto
    }

    // Fallback: open mailto so message always gets through
    try {
      const subject = encodeURIComponent(`[Time to Moto] Support — ${name.trim()}`);
      const body = encodeURIComponent(
        `Name: ${name.trim()}\nEmail: ${email.trim()}${phone.trim() ? `\nPhone: ${phone.trim()}` : ''}\nPlatform: ${Platform.OS}\n\n${description.trim()}`,
      );
      const mailto = `mailto:keith@timetomoto.com?subject=${subject}&body=${body}`;
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
        setScreenState('success');
        return;
      }
    } catch {
      // mailto also failed
    }

    setErrorMsg('Could not send message. Please email keith@timetomoto.com directly.');
    setScreenState('error');
  }

  // ── Success state ──
  if (screenState === 'success') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={theme.textPrimary} />
          </Pressable>
          <Text style={[styles.heading, { color: theme.textPrimary }]}>HELP & CONTACT</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <Feather name="check-circle" size={56} color={theme.green} />
          <Text style={[styles.stateTitle, { color: theme.textPrimary }]}>MESSAGE SENT</Text>
          <Text style={[styles.stateMsg, { color: theme.textSecondary }]}>
            Thanks for reaching out! We'll get back to you at {email} within 1-2 business days.
          </Text>
          <Pressable style={[styles.actionBtn, { backgroundColor: theme.red }]} onPress={() => router.back()}>
            <Text style={styles.actionBtnText}>GO BACK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ──
  if (screenState === 'error') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={theme.textPrimary} />
          </Pressable>
          <Text style={[styles.heading, { color: theme.textPrimary }]}>HELP & CONTACT</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <Feather name="alert-circle" size={56} color={theme.red} />
          <Text style={[styles.stateTitle, { color: theme.textPrimary }]}>SEND FAILED</Text>
          <Text style={[styles.stateMsg, { color: theme.textSecondary }]}>{errorMsg}</Text>
          <Pressable style={[styles.actionBtn, { backgroundColor: theme.red }]} onPress={() => setScreenState('form')}>
            <Text style={styles.actionBtnText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form state ──
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>HELP & CONTACT</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Have a question, bug report, or feedback? We'd love to hear from you.
          </Text>

          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <FieldLabel label="NAME" required />
            <StyledInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              error={!!errors.name}
              autoCorrect={false}
            />
            {!!errors.name && <Text style={[styles.errText, { color: '#FF6B35' }]}>{errors.name}</Text>}

            <FieldLabel label="EMAIL" required />
            <StyledInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              error={!!errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!errors.email && <Text style={[styles.errText, { color: '#FF6B35' }]}>{errors.email}</Text>}

            <FieldLabel label="PHONE (OPTIONAL)" />
            <StyledInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 555-5555"
              keyboardType="phone-pad"
            />

            <FieldLabel label="DESCRIPTION" required />
            <StyledInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your issue or question…"
              error={!!errors.description}
              multiline
              numberOfLines={5}
              style={styles.textArea}
              textAlignVertical="top"
            />
            {!!errors.description && <Text style={[styles.errText, { color: '#FF6B35' }]}>{errors.description}</Text>}
          </View>

          <Pressable
            style={[styles.submitBtn, { backgroundColor: theme.red }, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>SEND MESSAGE</Text>
                </>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },

  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    gap: 8,
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    minHeight: 100,
  },
  errText: {
    fontSize: 11,
    marginTop: -4,
  },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 16,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.7,
  },

  // State screens
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 8,
  },
  stateMsg: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
});
