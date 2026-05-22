import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, IconButton, InlineNotice, Pill, ScreenScroll, SecondaryButton, ToggleRow } from '@/components/ui';
import { SectionHeader } from '@/components/section-header';
import { usePagamax } from '@/context/pagamax-context';
import { describePromoDataSource, describePromoSyncStatus, formatPromoDataDate, isPromoDataStale } from '@/lib/promo-data';
import { colors, radius, spacing, typography } from '@/lib/theme';

function formatDiagnosticTime(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.toLocaleDateString('es-AR')} ${date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function ProfileScreen() {
  const {
    checkForPromoUpdates,
    clearDiagnostics,
    diagnostics,
    promoDataStatus,
    settings,
    updateSettings,
  } = usePagamax();

  const staleData = isPromoDataStale(promoDataStatus.generatedAt);
  const visibleDiagnostics = diagnostics.slice(0, 8);
  const manifestUrl = promoDataStatus.manifestUrl;

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Preferencias y control</Text>
        <View style={styles.placeholder} />
      </View>

      <SectionHeader title="Optimizacion" subtitle="Define como quieres que Paga Menos ordene las rutas por defecto." />
      <Card style={styles.card}>
        <View style={styles.chips}>
          <Chip label="Maximo ahorro" selected={settings.optimizationMode === 'max_savings'} onPress={() => updateSettings({ optimizationMode: 'max_savings' })} />
          <Chip label="Pago mas rapido" selected={settings.optimizationMode === 'fastest_checkout'} onPress={() => updateSettings({ optimizationMode: 'fastest_checkout' })} />
        </View>
        <Text style={styles.help}>Modo actual: {settings.optimizationMode === 'max_savings' ? 'prioriza ahorro neto' : 'prioriza menos pasos y menor friccion'}.</Text>
      </Card>

      <SectionHeader title="Alertas" subtitle="Solo avisos utiles y con umbral visible." />
      <Card style={styles.card}>
        <ToggleRow
          title="Notificaciones"
          body="Avisos cuando el ahorro neto esperado supere tu umbral."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
        <View style={styles.thresholdRow}>
          <Text style={styles.thresholdLabel}>Umbral minimo</Text>
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
      </Card>

      <SectionHeader title="Superficies" subtitle="Decide donde quieres que Paga Menos busque oportunidades utiles." />
      <Card style={styles.card}>
        <ToggleRow
          title="En tienda"
          body="QR y pagos presenciales."
          value={settings.surfacePreferences.inStore}
          onValueChange={(value) => updateSettings({ surfacePreferences: { ...settings.surfacePreferences, inStore: value } })}
        />
        <ToggleRow
          title="Checkout online"
          body="Links y checkouts donde convenga comparar antes de pagar."
          value={settings.surfacePreferences.online}
          onValueChange={(value) => updateSettings({ surfacePreferences: { ...settings.surfacePreferences, online: value } })}
        />
        <ToggleRow
          title="Viajes"
          body="Reservas y tickets; queda en modo avanzado."
          value={settings.surfacePreferences.travel}
          onValueChange={(value) => updateSettings({ surfacePreferences: { ...settings.surfacePreferences, travel: value } })}
        />
      </Card>

      <SectionHeader title="Datos y pruebas" subtitle="Lo importante para testear en Carrefour, DIA u otros comercios reales." />
      <Card style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.statusTitle}>Fuente actual</Text>
          <Pill label={describePromoDataSource(promoDataStatus)} tone={promoDataStatus.source === 'bundled' ? 'warning' : 'success'} />
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Estado remoto</Text>
          <Text style={styles.statusValue}>{describePromoSyncStatus(promoDataStatus)}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Generado</Text>
          <Text style={styles.statusValue}>{formatPromoDataDate(promoDataStatus.generatedAt)}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Ultimo check</Text>
          <Text style={styles.statusValue}>{formatPromoDataDate(promoDataStatus.lastCheckedAt, 'nunca')}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Version local</Text>
          <Text style={styles.statusValue}>{promoDataStatus.localVersion ?? 'sin version'}</Text>
        </View>
        {staleData ? (
          <InlineNotice
            title="Base posiblemente vieja"
            body="Si hoy vas a probar en tiendas, revisa el remoto antes de salir o puede que evales promos vencidas."
            tone="warning"
          />
        ) : null}
        {promoDataStatus.lastError ? (
          <InlineNotice title="Error remoto" body={promoDataStatus.lastError} tone="warning" />
        ) : null}
        <SecondaryButton onPress={() => void checkForPromoUpdates()}>
          {promoDataStatus.lastSyncStatus === 'checking' ? 'Revisando descuentos...' : 'Revisar descuentos ahora'}
        </SecondaryButton>
        {manifestUrl ? (
          <SecondaryButton onPress={() => void Linking.openURL(manifestUrl)}>
            Abrir manifest remoto
          </SecondaryButton>
        ) : null}
      </Card>

      <SectionHeader title="Transparencia" subtitle="La propuesta tiene que ser simple de entender antes de pagar." />
      <Card style={styles.card}>
        <Text style={styles.help}>Paga Menos muestra ahorro bruto, fee y ahorro neto en cada recomendacion.</Text>
        <Text style={styles.help}>Si una ruta depende del dia, del tope o de condiciones extra, lo marcamos antes de abrir la app de pago.</Text>
        <Text style={styles.help}>La idea es ayudarte a pagar mejor, no empujarte a usar una ruta que no entiendes.</Text>
      </Card>

      <SectionHeader title="Modo avanzado" subtitle="Controles extra para depurar el ranking y los handoffs." />
      <Card style={styles.card}>
        <ToggleRow
          title="Debug visible"
          body="Muestra detalles extra en resultados y habilita evidencia tecnica."
          value={settings.debugEnabled}
          onValueChange={(value) => updateSettings({ debugEnabled: value })}
        />
        <ToggleRow
          title="Modo avanzado"
          body="Activa superficies y controles experimentales."
          value={settings.advancedMode}
          onValueChange={(value) => updateSettings({ advancedMode: value })}
        />
        <Text style={styles.help}>Paga Menos muestra fee, ahorro estimado y caveats en cada recomendacion. No oculta el costo de usar la app.</Text>
      </Card>

      <SectionHeader title="Eventos recientes" subtitle="Registro corto de actualizaciones, QR, matches y handoffs." />
      <Card style={styles.card}>
        {visibleDiagnostics.length > 0 ? visibleDiagnostics.map((event) => (
          <View key={event.id} style={styles.eventRow}>
            <View style={styles.eventHeader}>
              <Pill
                label={`${event.category} ${event.level}`}
                tone={event.level === 'error' ? 'warning' : event.level === 'warning' ? 'warning' : 'default'}
              />
              <Text style={styles.eventTime}>{formatDiagnosticTime(event.createdAt)}</Text>
            </View>
            <Text style={styles.eventMessage}>{event.message}</Text>
            {event.detail ? <Text style={styles.eventDetail}>{event.detail}</Text> : null}
          </View>
        )) : (
          <Text style={styles.help}>Todavia no hay eventos guardados. Escanea un QR o revisa descuentos para generar evidencia.</Text>
        )}
        <SecondaryButton onPress={() => void clearDiagnostics()}>Limpiar eventos</SecondaryButton>
      </Card>

      <SectionHeader title="Comercios guardados" subtitle="Accesos rapidos para reuso frecuente." />
      <Card style={styles.card}>
        <View style={styles.chips}>
          {settings.savedMerchants.length > 0 ? settings.savedMerchants.map((merchant) => (
            <Chip
              key={merchant}
              label={merchant}
              selected
              onPress={() => updateSettings({ savedMerchants: settings.savedMerchants.filter((item) => item !== merchant) })}
            />
          )) : <Text style={styles.help}>Todavia no guardaste comercios para reuso rapido.</Text>}
        </View>
      </Card>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  statusValue: {
    ...typography.bodySm,
    color: colors.ink,
    textAlign: 'right',
    flexShrink: 1,
  },
  eventRow: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eventTime: {
    ...typography.caption,
    color: colors.inkMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  eventMessage: {
    ...typography.headingSm,
    color: colors.ink,
  },
  eventDetail: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
});
