import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BrandLockup } from '@/components/brand-lockup';
import { ONBOARDING_PAGES } from '@/lib/demo-data';
import { Card, Chip, PrimaryButton, ScreenScroll, SecondaryButton, ToggleRow } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function OnboardingScreen() {
  const { account, completeOnboarding, settings, updateSettings } = usePagamax();
  const [step, setStep] = useState(0);
  const current = ONBOARDING_PAGES[step]!;

  const finish = () => {
    completeOnboarding();
    router.replace(account ? '/' : '/account');
  };

  return (
    <ScreenScroll contentContainerStyle={styles.screen}>
      <View style={styles.progressRow}>
        {ONBOARDING_PAGES.map((page, index) => (
          <View key={page.id} style={[styles.progressDot, index <= step && styles.progressDotActive]} />
        ))}
      </View>

      <Card elevated style={styles.hero}>
        <BrandLockup showHolding />
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
        <View style={styles.scanPreview}>
          <View style={styles.scanIcon}>
            <Ionicons name="qr-code-outline" size={30} color={colors.white} />
          </View>
          <View style={styles.scanCopy}>
            <Text style={styles.scanTitle}>Escanear QR</Text>
            <Text style={styles.scanBody}>Lo unico que tenes que acordarte: antes de pagar, apunta aca.</Text>
          </View>
        </View>
        <View style={styles.benefits}>
          <Chip label="Escanear antes de pagar" selected />
          <Chip label="Te digo con que pagar" selected />
          <Chip label="Vos confirmas siempre" selected />
        </View>
      </Card>

      <View style={styles.exampleRow}>
        <Chip label="Farmacia" selected={step === 0} />
        <Chip label="Combustible" selected={step === 1} />
        <Chip label="Link de pago" selected={step === 2} />
      </View>

      {step === ONBOARDING_PAGES.length - 1 ? (
        <Card style={styles.permissions}>
          <ToggleRow
            title="Ahorro cercano"
            body="Ideas cerca tuyo, solo si pueden servir. Opcional."
            value={settings.locationInsightsEnabled}
            onValueChange={(value) => updateSettings({ locationInsightsEnabled: value })}
          />
          <ToggleRow
            title="Alertas de alto valor"
            body="Solo cuando la plata justifica la molestia."
            value={settings.notificationsEnabled}
            onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
          />
        </Card>
      ) : null}

      <View style={styles.footer}>
        {step < ONBOARDING_PAGES.length - 1 ? (
          <>
            <PrimaryButton onPress={() => setStep((prev) => prev + 1)}>Siguiente</PrimaryButton>
            <SecondaryButton onPress={finish}>Omitir y empezar</SecondaryButton>
          </>
        ) : (
          <>
            <PrimaryButton onPress={finish}>{account ? 'Escanear mi primer pago' : 'Crear cuenta beta'}</PrimaryButton>
            <SecondaryButton onPress={() => setStep((prev) => Math.max(0, prev - 1))}>Atras</SecondaryButton>
          </>
        )}
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressDot: {
    flex: 1,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.divider,
  },
  progressDotActive: {
    backgroundColor: colors.accent,
  },
  hero: {
    gap: spacing.md,
  },
  benefits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scanPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.teal,
    padding: spacing.md,
  },
  scanIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  scanCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  scanTitle: {
    ...typography.headingLg,
    color: colors.white,
  },
  scanBody: {
    ...typography.bodySm,
    color: colors.whiteSoft,
  },
  title: {
    ...typography.displayLg,
    color: colors.ink,
  },
  body: {
    ...typography.bodyLg,
    color: colors.inkMuted,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  permissions: {
    gap: spacing.md,
  },
  footer: {
    gap: spacing.sm,
  },
});
