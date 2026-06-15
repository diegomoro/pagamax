import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IconButton, InlineNotice, PrimaryButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing, typography } from '@/lib/theme';

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const { completeMagicLinkSignIn } = usePagamax();
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('Verificando tu email...');

  useEffect(() => {
    const exchangeToken = firstParam(params.exchangeToken) ?? firstParam(params.token);
    if (!exchangeToken) {
      setStatus('error');
      setMessage('El link de acceso no trae un token valido.');
      return;
    }

    let cancelled = false;
    void completeMagicLinkSignIn(exchangeToken)
      .then(() => {
        if (cancelled) return;
        setStatus('done');
        setMessage('Tu email quedo verificado.');
        setTimeout(() => router.replace('/profile'), 650);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setMessage(caught instanceof Error ? caught.message : 'No se pudo verificar el link.');
      });

    return () => {
      cancelled = true;
    };
  }, [completeMagicLinkSignIn, params.exchangeToken, params.token]);

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.replace('/account')} />
        <Text style={styles.title}>Acceso por email</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.panel}>
        {status === 'working' ? <ActivityIndicator color={colors.accent} /> : null}
        <InlineNotice
          title={status === 'done' ? 'Listo' : status === 'error' ? 'No pudimos entrar' : 'Verificando'}
          body={message}
          tone={status === 'error' ? 'warning' : 'default'}
        />
      </View>

      {status === 'error' ? (
        <View style={styles.actions}>
          <PrimaryButton onPress={() => router.replace('/account')}>Volver a cuenta</PrimaryButton>
          <SecondaryButton onPress={() => router.replace('/')}>Ir al inicio</SecondaryButton>
        </View>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  placeholder: {
    width: 44,
  },
  title: {
    ...typography.headingLg,
    color: colors.ink,
  },
  panel: {
    gap: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});
