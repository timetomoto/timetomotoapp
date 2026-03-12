import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthStore } from '../lib/store';
import { useTheme } from '../lib/useTheme';
import { supabase } from '../lib/supabase';
import TimetomotoLogo from '../components/common/TimetomotoLogo';

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { signIn, signUp } = useAuthStore();

  function reset() {
    setError(null);
    setSuccessMsg(null);
  }

  async function handleSubmit() {
    if (mode === 'reset') {
      if (!email.trim()) { setError('Enter your email address.'); return; }
      reset();
      setLoading(true);
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
      setLoading(false);
      if (err) setError(err.message);
      else setSuccessMsg('Password reset email sent. Check your inbox.');
      return;
    }

    if (!email || !password) { setError('Email and password are required.'); return; }
    reset();
    setLoading(true);

    const err = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password);

    setLoading(false);
    if (err) setError(err);
    else if (mode === 'signup') setSuccessMsg('Check your email to confirm your account.');
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Logo */}
      <View style={styles.logoArea}>
        <TimetomotoLogo width={300} height={56} />
      </View>

      {/* Card */}
      <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
        <Text style={[styles.heading, { color: theme.textPrimary }]}>
          {mode === 'signin' ? 'SIGN IN' : mode === 'signup' ? 'CREATE ACCOUNT' : 'RESET PASSWORD'}
        </Text>

        <TextInput
          style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {mode !== 'reset' && (
          <TextInput
            style={[styles.input, { backgroundColor: theme.bgPanel, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        )}

        {error && <Text style={[styles.errorText, { color: theme.red }]}>{error}</Text>}
        {successMsg && <Text style={styles.successText}>{successMsg}</Text>}

        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: theme.red }, pressed && styles.btnPressed]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {mode === 'signin' ? 'SIGN IN' : mode === 'signup' ? 'SIGN UP' : 'SEND RESET EMAIL'}
              </Text>
          }
        </Pressable>

        {/* Forgot password (sign-in only) */}
        {mode === 'signin' && (
          <Pressable onPress={() => { setMode('reset'); reset(); }}>
            <Text style={[styles.toggleText, { color: theme.textSecondary }]}>Forgot password?</Text>
          </Pressable>
        )}

        {/* Toggle signin ↔ signup */}
        {mode !== 'reset' ? (
          <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); reset(); }}>
            <Text style={[styles.toggleText, { color: theme.textSecondary }]}>
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => { setMode('signin'); reset(); }}>
            <Text style={[styles.toggleText, { color: theme.textSecondary }]}>Back to sign in</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoArea: {
    marginBottom: 48,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    gap: 14,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorText: {
    fontSize: 13,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 13,
  },
  btn: {
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
  },
  toggleText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});
