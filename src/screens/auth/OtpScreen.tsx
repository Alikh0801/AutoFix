import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { fonts, type } from '../../theme/typography';
import { Button } from '../../components/Button';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { errorMessage } from '../../lib/errors';
import { OTP_LENGTH, sanitizeOtp } from '../../lib/credentials';

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

// Matches Supabase's own limit: a confirmation code can only be requested
// once every 60 seconds.
const RESEND_SECONDS = 60;

export function OtpScreen({ route, navigation }: Props) {
  const { email, from } = route.params;
  const { confirmSignUp, resendSignUpCode } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async (value: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    Keyboard.dismiss();
    setError(null);
    setVerifying(true);
    try {
      // On success the session arrives through onAuthStateChange and the root
      // navigator swaps to the app — nothing to navigate to from here.
      await confirmSignUp(email, value);
    } catch (e: any) {
      submittedRef.current = false;
      setVerifying(false);
      setCode('');
      setError(errorMessage(e, 'Kod təsdiqlənmədi. Yenidən cəhd et.'));
      inputRef.current?.focus();
    }
  };

  const onChange = (raw: string) => {
    const next = sanitizeOtp(raw);
    setCode(next);
    setError(null);
    // Submitting on the last digit saves a tap; the guard keeps a second
    // keystroke from firing it twice.
    if (next.length === OTP_LENGTH) verify(next);
  };

  const onResend = async () => {
    setError(null);
    setNotice(null);
    try {
      await resendSignUpCode(email);
      setSecondsLeft(RESEND_SECONDS);
      setNotice('Yeni kod göndərildi.');
    } catch (e: any) {
      setError(errorMessage(e, 'Kod göndərilmədi. Bir az gözlə.'));
    }
  };

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => code[i] ?? '');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Geri"
          >
            <Feather name="arrow-left" size={20} color={colors.cream} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <Feather name="mail" size={28} color={colors.amber} />
          </View>

          <Text style={styles.title}>E-poçtunu yoxla</Text>
          <Text style={styles.subtitle}>
            {from === 'login'
              ? 'Hesabın hələ təsdiqlənməyib. '
              : ''}
            <Text style={styles.email}>{email}</Text> ünvanına {OTP_LENGTH} rəqəmli kod göndərdik.
          </Text>

          {/* One real input behind a row of boxes: the OS keeps paste and
              SMS/email autofill working, which per-box inputs break. */}
          <Pressable style={styles.boxRow} onPress={() => inputRef.current?.focus()}>
            {boxes.map((digit, i) => (
              <View
                key={i}
                style={[
                  styles.box,
                  i === code.length && styles.boxActive,
                  !!digit && styles.boxFilled,
                ]}
              >
                <Text style={styles.boxText}>{digit}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            autoFocus
            maxLength={OTP_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={styles.hiddenInput}
            accessibilityLabel="Təsdiq kodu"
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {!error && notice && <Text style={styles.notice}>{notice}</Text>}

          <Button
            label="Təsdiqlə"
            onPress={() => verify(code)}
            loading={verifying}
            disabled={code.length < OTP_LENGTH}
            style={{ marginTop: 24 }}
          />

          <Pressable
            onPress={onResend}
            disabled={secondsLeft > 0}
            style={styles.resendRow}
            accessibilityRole="button"
            accessibilityLabel="Kodu yenidən göndər"
          >
            <Text style={[styles.resendText, secondsLeft === 0 && styles.resendActive]}>
              {secondsLeft > 0 ? `Yenidən göndər (${secondsLeft} san)` : 'Kodu yenidən göndər'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 28 },
  header: { paddingVertical: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, alignItems: 'center', paddingTop: 24 },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { ...type.h2, textAlign: 'center', marginBottom: 8 },
  subtitle: {
    ...type.bodyDim,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  email: { fontFamily: fonts.bodySemi, color: colors.cream },
  boxRow: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', justifyContent: 'center' },
  // Width comes from the row rather than a fixed number: at six digits the
  // boxes cap out and centre, at eight they shrink to fit a narrow phone
  // instead of overflowing it.
  box: {
    flex: 1,
    minWidth: 0,
    maxWidth: 46,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.amber },
  boxFilled: { borderColor: colors.amberDim },
  boxText: { fontFamily: fonts.monoSemi, fontSize: 20, color: colors.cream },
  // Off-screen rather than display:none — a hidden input stops receiving
  // keystrokes on Android.
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: 18 },
  notice: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.success, textAlign: 'center', marginTop: 18 },
  resendRow: { paddingVertical: 18 },
  resendText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textFaint },
  resendActive: { color: colors.amber },
});
