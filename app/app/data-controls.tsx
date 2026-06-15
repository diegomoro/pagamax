import { Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, IconButton, ScreenScroll, SecondaryButton, ToggleRow } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing, typography } from '@/lib/theme';

export default function DataControlsScreen() {
  const { diagnostics, promoDataStatus, settings, updateSettings } = usePagamax();

  const exportDiagnostics = async () => {
    await Share.share({
      message: JSON.stringify({
        exportedAt: new Date().toISOString(),
        promoDataStatus,
        diagnostics: diagnostics.slice(0, 20),
      }, null, 2),
    });
  };

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Datos</Text>
        <View style={styles.placeholder} />
      </View>
      <Card style={styles.card}>
        <ToggleRow
          title="Analítica"
          body="Eventos de uso, ranking y apertura de apps, sin credenciales ni QR completo."
          value={settings.analyticsEnabled}
          onValueChange={(value) => updateSettings({ analyticsEnabled: value })}
        />
        <ToggleRow
          title="Insights comerciales"
          body="Datos agregados para comercios y emisores, sin vender datos sensibles identificables."
          value={settings.merchantInsightsEnabled}
          onValueChange={(value) => updateSettings({ merchantInsightsEnabled: value })}
        />
        <ToggleRow
          title="Ofertas pagas"
          body="Mostrar oportunidades patrocinadas siempre marcadas y separadas."
          value={settings.sponsoredOffersEnabled}
          onValueChange={(value) => updateSettings({ sponsoredOffersEnabled: value })}
        />
      </Card>
      <SecondaryButton onPress={() => void exportDiagnostics()}>Exportar diagnóstico</SecondaryButton>
      <SecondaryButton onPress={() => router.push('/delete-account')}>Eliminar cuenta y datos</SecondaryButton>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placeholder: { width: 44 },
  title: { ...typography.headingLg, color: colors.ink },
  card: { gap: spacing.md },
});
