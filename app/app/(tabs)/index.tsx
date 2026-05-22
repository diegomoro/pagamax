import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_ACTIVITY, DEMO_REPEAT_MERCHANTS } from '@/lib/demo-data';
import { BottomSheet, Card, IconButton, InlineNotice, LoadingBlock, SecondaryButton, ToggleRow } from '@/components/ui';
import { BrandLockup } from '@/components/brand-lockup';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, shadows, spacing, typography } from '@/lib/theme';

const PRIVACY_POLICY_URL = 'https://github.com/diegomoro/pagamax/blob/main/app/PRIVACY_POLICY.md';

export default function HomeScreen() {
  const {
    activity,
    currentSession,
    error,
    loading,
    promoIndex,
    settings,
    updateSettings,
  } = usePagamax();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loading && !settings.onboardingCompleted) {
      router.replace('/onboarding');
    }
  }, [loading, settings.onboardingCompleted]);

  const quickMerchantNames = useMemo(() => (
    Array.from(new Set([
      ...settings.savedMerchants,
      ...activity.slice(0, 3).map((item) => item.merchantName),
      ...DEMO_ACTIVITY.slice(0, 2).map((item) => item.merchantName),
      ...DEMO_REPEAT_MERCHANTS,
    ])).slice(0, 3)
  ), [activity, settings.savedMerchants]);

  if (loading) {
    return <LoadingBlock label="Cargando Paga Menos..." />;
  }

  if (error || !promoIndex) {
    return (
      <View style={styles.errorWrap}>
        <InlineNotice title="No se pudieron cargar los datos" body={error ?? 'Intenta abrir la app de nuevo.'} tone="warning" />
        <SecondaryButton onPress={() => router.push('/manual')}>Buscar comercio</SecondaryButton>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topBar}>
          <BrandLockup compact showTagline={false} />
          <IconButton icon="options-outline" onPress={() => setSettingsOpen(true)} />
        </View>

        <View style={styles.heroArea}>
          <Pressable onPress={() => router.push('/scan')} style={({ pressed }) => [styles.scanCard, pressed && styles.scanCardPressed]}>
            <LinearGradient colors={[colors.accent, colors.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scanFill}>
              <View style={styles.scanIconWrap}>
                <Ionicons name="qr-code-outline" size={42} color={colors.teal} />
              </View>
              <Text style={styles.scanLabel}>Escanear QR</Text>
              <Text style={styles.scanMeta}>Pago en tienda</Text>
            </LinearGradient>
          </Pressable>

          <View style={styles.secondaryArea}>
            <SecondaryButton onPress={() => router.push('/manual')}>Buscar comercio</SecondaryButton>
            <Pressable onPress={() => router.push('/checkout-link')}>
              <Text style={styles.linkAction}>Pegar link de pago</Text>
            </Pressable>
          </View>

          {currentSession ? (
            <Pressable style={styles.resumeCard} onPress={() => router.push('/results')}>
              <Text style={styles.resumeLabel}>Ultimo check</Text>
              <Text numberOfLines={1} style={styles.resumeMerchant}>{currentSession.match.merchant_name}</Text>
            </Pressable>
          ) : null}

          {!currentSession && quickMerchantNames.length > 0 ? (
            <View style={styles.quickArea}>
              <Text style={styles.quickLabel}>Recientes</Text>
              <View style={styles.quickRow}>
                {quickMerchantNames.map((merchant) => (
                  <Pressable
                    key={merchant}
                    style={styles.quickChip}
                    onPress={() => router.push({ pathname: '/manual', params: { merchant } })}
                  >
                    <Text numberOfLines={1} style={styles.quickChipLabel}>{merchant}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} title="Centro de control">
        <ToggleRow
          title="Notificaciones"
          body="Avisos solo si valen la pena."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
        <ToggleRow
          title="Modo de optimizacion"
          body={settings.optimizationMode === 'max_savings' ? 'Prioriza mas ahorro.' : 'Prioriza menos pasos.'}
          value={settings.optimizationMode === 'fastest_checkout'}
          onValueChange={(value) => updateSettings({ optimizationMode: value ? 'fastest_checkout' : 'max_savings' })}
        />
        <SecondaryButton onPress={() => router.push('/profile')}>Abrir preferencias</SecondaryButton>
        <SecondaryButton onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>Politica de privacidad</SecondaryButton>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 128,
    gap: spacing.lg,
  },
  errorWrap: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.md,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroArea: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  scanCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  scanCardPressed: {
    transform: [{ scale: 0.985 }],
  },
  scanFill: {
    minHeight: 320,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  scanIconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.whiteSoft,
  },
  scanLabel: {
    ...typography.displayLg,
    color: colors.white,
    textAlign: 'center',
  },
  scanMeta: {
    ...typography.headingSm,
    color: colors.whiteSoft,
    textAlign: 'center',
  },
  secondaryArea: {
    gap: spacing.sm,
  },
  linkAction: {
    ...typography.headingSm,
    color: colors.accentPressed,
    textAlign: 'center',
  },
  resumeCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  resumeLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  resumeMerchant: {
    ...typography.headingSm,
    color: colors.ink,
  },
  quickArea: {
    gap: spacing.sm,
  },
  quickLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickChip: {
    maxWidth: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickChipLabel: {
    ...typography.headingSm,
    color: colors.ink,
  },
});
