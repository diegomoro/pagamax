import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BrandLockup } from '@/components/brand-lockup';
import { ONBOARDING_PAGES } from '@/lib/demo-data';
import { Card, Chip, PrimaryButton, ScreenScroll, SecondaryButton, ToggleRow } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function OnboardingScreen() {
  const { completeOnboarding, settings, updateSettings } = usePagamax();
  const [step, setStep] = useState(0);
  const current = ONBOARDING_PAGES[step]!;

  const finish = () => {
    completeOnboarding();
    router.replace('/');
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
        <View style={styles.benefits}>
          <Chip label="Ahorro bruto claro" selected />
          <Chip label="Fee visible" selected />
          <Chip label="Confianza y caveats" selected />
        </View>
      </Card>

      <View style={styles.exampleRow}>
        <Chip label="Farmacia" selected={step === 0} />
        <Chip label="Combustible" selected={step === 1} />
        <Chip label="Link de pago" selected={step === 2} />
      </View>

      <Card style={styles.permissions}>
        <ToggleRow
          title="Ahorro cercano"
          body="Activa sugerencias cercanas cuando te convenga. Pediremos permiso real solo cuando haga falta."
          value={settings.locationInsightsEnabled}
          onValueChange={(value) => updateSettings({ locationInsightsEnabled: value })}
        />
        <ToggleRow
          title="Alertas de alto valor"
          body="Avisos solo si superan tu umbral y pueden ahorrarte tiempo o dinero real."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
      </Card>

      <View style={styles.footer}>
        {step < ONBOARDING_PAGES.length - 1 ? (
          <>
            <PrimaryButton onPress={() => setStep((prev) => prev + 1)}>Siguiente</PrimaryButton>
            <SecondaryButton onPress={finish}>Omitir y empezar</SecondaryButton>
          </>
        ) : (
          <>
            <PrimaryButton onPress={finish}>Empezar a usar Paga Menos</PrimaryButton>
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
