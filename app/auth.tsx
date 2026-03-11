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
import { Colors } from '../lib/theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { signIn, signUp } = useAuthStore();

  async function handleSubmit() {
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const err =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password);

    setLoading(false);

    if (err) {
      setError(err);
    } else if (mode === 'signup') {
      setSuccessMsg('Check your email to confirm your account.');
    }
    // On sign-in success the auth guard in _layout.tsx handles redirect
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Logo */}
      <View style={styles.logoArea}>
        <Text style={styles.logoText}>TIME</Text>
        <Text style={[styles.logoText, styles.logoRed]}>TO</Text>
        <Text style={styles.logoText}>MOTO</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.heading}>
          {mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.TEXT_SECONDARY}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.TEXT_SECONDARY}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}
        {successMsg && <Text style={styles.successText}>{successMsg}</Text>}

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {mode === 'signin' ? 'SIGN IN' : 'SIGN UP'}
            </Text>
          )}
        </Pressable>

        {/* Toggle mode */}
        <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setSuccessMsg(null); }}>
          <Text style={styles.toggleText}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.TTM_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoArea: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 40,
  },
  logoText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 3,
  },
  logoRed: {
    color: Colors.TTM_RED,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.TTM_CARD,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 8,
    padding: 24,
    gap: 14,
  },
  heading: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.TTM_PANEL,
    borderWidth: 1,
    borderColor: Colors.TTM_BORDER,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
  },
  errorText: {
    color: Colors.TTM_RED,
    fontSize: 13,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 13,
  },
  btn: {
    backgroundColor: Colors.TTM_RED,
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
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});
