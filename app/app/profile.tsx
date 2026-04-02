import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Chip, IconButton, ScreenScroll, ToggleRow } from '@/components/ui';
import { SectionHeader } from '@/components/section-header';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function ProfileScreen() {
  const { settings, updateSettings } = usePagamax();

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Preferences and controls</Text>
        <View style={{ width: 44 }} />
      </View>

      <SectionHeader title="Optimization" subtitle="Define como quieres que Pagamax tome decisiones por defecto." />
      <View style={styles.card}>
        <View style={styles.chips}>
          <Chip label="Max savings" selected={settings.optimizationMode === 'max_savings'} onPress={() => updateSettings({ optimizationMode: 'max_savings' })} />
          <Chip label="Fastest payment" selected={settings.optimizationMode === 'fastest_checkout'} onPress={() => updateSettings({ optimizationMode: 'fastest_checkout' })} />
        </View>
        <Text style={styles.help}>Modo actual: {settings.optimizationMode === 'max_savings' ? 'mas valor neto' : 'menos pasos y menos friccion'}.</Text>
      </View>

      <SectionHeader title="Alerts" subtitle="Solo avisos utiles. Nada de ruido." />
      <View style={styles.card}>
        <ToggleRow
          title="Notifications"
          body="Avisos cuando el ahorro neto esperado supere tu umbral."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
        <View style={styles.thresholdRow}>
          <Text style={styles.thresholdLabel}>Alert threshold</Text>
          <View style={styles.chips}>
            {[1500, 2500, 4000].map((value) => (
              <Chip
                key={value}
                label={`$${value.toLocaleString('es-AR')}`}
                selected={settings.alertThresholdArs === value}
                onPress={() => updateSettings({ alertThresholdArs: value })}
              />
            ))}
          </View>
        </View>
      </View>

      <SectionHeader title="Surfaces" subtitle="Decide donde quieres que Pagamax priorice oportunidades." />
      <View style={styles.card}>
        <ToggleRow
          title="In-store"
          body="QR y pagos presenciales."
          value={settings.surfacePreferences.inStore}
          onValueChange={(value) => updateSettings({ surfacePreferences: { ...settings.surfacePreferences, inStore: value } })}
        />
        <ToggleRow
          title="Online checkout"
          body="Links y checkouts donde convenga comparar antes de pagar."
          value={settings.surfacePreferences.online}
          onValueChange={(value) => updateSettings({ surfacePreferences: { ...settings.surfacePreferences, online: value } })}
        />
        <ToggleRow
          title="Travel"
          body="Reservas y tickets, pensado para usuarios avanzados."
          value={settings.surfacePreferences.travel}
          onValueChange={(value) => updateSettings({ surfacePreferences: { ...settings.surfacePreferences, travel: value } })}
        />
      </View>

      <SectionHeader title="Power user mode" subtitle="Controles extra para quienes quieren mas precision." />
      <View style={styles.card}>
        <ToggleRow
          title="Advanced mode"
          body="Muestra mas contexto, filtros y surfaces experimentales."
          value={settings.advancedMode}
          onValueChange={(value) => updateSettings({ advancedMode: value })}
        />
        <Text style={styles.help}>Pagamax gana una parte visible del ahorro. Hoy el fee mostrado es explicito en cada recomendacion y nunca se oculta.</Text>
      </View>

      <SectionHeader title="Saved merchants" subtitle="Accesos rapidos para tus comercios mas repetidos." />
      <View style={styles.card}>
        <View style={styles.chips}>
          {settings.savedMerchants.length > 0 ? settings.savedMerchants.map((merchant) => (
            <Chip key={merchant} label={merchant} selected onPress={() => updateSettings({ savedMerchants: settings.savedMerchants.filter((item) => item !== merchant) })} />
          )) : <Text style={styles.help}>Todavia no guardaste comercios para reuso rapido.</Text>}
        </View>
      </View>
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
  title: {
    ...typography.headingLg,
    color: colors.ink,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thresholdRow: {
    gap: spacing.xs,
  },
  thresholdLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  help: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
});
