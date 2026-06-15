import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card, Chip, IconButton, InlineNotice, Pill, ScreenScroll, SecondaryButton, ToggleRow } from '@/components/ui';
import { SectionHeader } from '@/components/section-header';
import { FUNDING_DESTINATIONS_ENABLED } from '@/config/public-build';
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
    account,
    checkForPromoUpdates,
    clearDiagnostics,
    diagnostics,
    promoDataStatus,
    settings,
    signOutAccount,
    updateSettings,
  } = usePagamax();

  const staleData = isPromoDataStale(promoDataStatus.generatedAt);
  const visibleDiagnostics = diagnostics.slice(0, 8);
  const manifestUrl = promoDataStatus.manifestUrl;
  const remoteHashLabel = promoDataStatus.remoteSha256
    ? `${promoDataStatus.remoteSha256.slice(0, 12)}... ${promoDataStatus.hashVerified ? 'verificado' : 'sin verificar'}`
    : 'sin hash';

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Preferencias y control</Text>
        <View style={styles.placeholder} />
      </View>

      <Card style={styles.trustCard}>
        <View style={styles.trustHeader}>
          <View style={styles.trustIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.accentPressed} />
          </View>
          <View style={styles.trustCopy}>
            <Text style={styles.trustTitle}>Reglas de confianza</Text>
            <Text style={styles.trustBody}>Primero va lo que más te sirve. Si un comercio paga por aparecer, se marca claro.</Text>
          </View>
        </View>
        <View style={styles.trustGrid}>
          <View style={styles.trustPill}>
            <Text style={styles.trustPillValue}>Ahorro estimado</Text>
            <Text style={styles.trustPillLabel}>sin promesas falsas</Text>
          </View>
          <View style={styles.trustPill}>
            <Text style={styles.trustPillValue}>QR primero</Text>
            <Text style={styles.trustPillLabel}>menos pasos</Text>
          </View>
          <View style={styles.trustPill}>
            <Text style={styles.trustPillValue}>Pauta separada</Text>
            <Text style={styles.trustPillLabel}>sin disfrazarla</Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Cuenta" subtitle="Identidad local para esta beta." />
      <Card style={styles.card}>
        {account ? (
          <>
            <View style={styles.accountHeader}>
              <View style={styles.accountAvatar}>
                <Ionicons name="person-outline" size={22} color={colors.accentPressed} />
              </View>
              <View style={styles.accountCopy}>
                <Text style={styles.accountName}>{account.displayName}</Text>
                <Text style={styles.help}>{account.email}</Text>
              </View>
              <Pill label={account.syncStatus === 'synced' ? 'sync' : 'local'} tone={account.syncStatus === 'synced' ? 'success' : 'warning'} />
            </View>
            {account.phoneLabel ? <Text style={styles.help}>Teléfono: {account.phoneLabel}</Text> : null}
            {FUNDING_DESTINATIONS_ENABLED && account.identityDocumentLast4 ? (
              <Text style={styles.help}>
                Identidad: termina en {account.identityDocumentLast4} - {account.identityVerificationStatus === 'same_owner_verified' ? 'verificada' : 'pendiente'}
              </Text>
            ) : null}
            <View style={styles.buttonRow}>
              <SecondaryButton stretch={false} onPress={() => router.push('/account')}>Editar</SecondaryButton>
              <SecondaryButton stretch={false} onPress={() => void signOutAccount()}>Cerrar local</SecondaryButton>
            </View>
          </>
        ) : (
          <>
            <InlineNotice
              title="Sin cuenta beta"
              body="Creá una cuenta local para asociar este teléfono y preparar la sincronización."
              tone="warning"
            />
            <SecondaryButton onPress={() => router.push('/account')}>Crear cuenta</SecondaryButton>
          </>
        )}
      </Card>

      <SectionHeader title="Privacidad" subtitle="Control, documentos y soporte para Google Play." />
      <Card style={styles.card}>
        <View style={styles.buttonRow}>
          <SecondaryButton stretch={false} onPress={() => router.push('/privacy')}>Privacidad</SecondaryButton>
          <SecondaryButton stretch={false} onPress={() => router.push('/terms')}>Términos</SecondaryButton>
          <SecondaryButton stretch={false} onPress={() => router.push('/data-controls')}>Datos</SecondaryButton>
          <SecondaryButton stretch={false} onPress={() => router.push('/support')}>Soporte</SecondaryButton>
        </View>
        <SecondaryButton onPress={() => router.push('/delete-account')}>Eliminar cuenta y datos</SecondaryButton>
      </Card>

      <SectionHeader title="Cómo elegir" subtitle="Decidí si querés más ahorro o menos vueltas." />
      <Card style={styles.card}>
        <View style={styles.chips}>
          <Chip label="Máximo ahorro" selected={settings.optimizationMode === 'max_savings'} onPress={() => updateSettings({ optimizationMode: 'max_savings' })} />
          <Chip label="Pago más rápido" selected={settings.optimizationMode === 'fastest_checkout'} onPress={() => updateSettings({ optimizationMode: 'fastest_checkout' })} />
        </View>
        <Text style={styles.help}>Modo actual: {settings.optimizationMode === 'max_savings' ? 'busca más plata para vos' : 'busca pagar con menos pasos'}.</Text>
      </Card>

      <SectionHeader title="Alertas" subtitle="Solo avisos útiles y con umbral visible." />
      <Card style={styles.card}>
        <ToggleRow
          title="Notificaciones"
          body="Avisos cuando la plata estimada supere tu mínimo."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
        <View style={styles.thresholdRow}>
          <Text style={styles.thresholdLabel}>Umbral mínimo</Text>
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

      <SectionHeader title="Dónde mirar" subtitle="Elegí en qué compras querés ayuda." />
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
          <Text style={styles.help}>Último check</Text>
          <Text style={styles.statusValue}>{formatPromoDataDate(promoDataStatus.lastCheckedAt, 'nunca')}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Versión local</Text>
          <Text style={styles.statusValue}>{promoDataStatus.localVersion ?? 'sin versión'}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Hash remoto</Text>
          <Text style={styles.statusValue}>{remoteHashLabel}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.help}>Fresco hasta</Text>
          <Text style={styles.statusValue}>{formatPromoDataDate(promoDataStatus.staleAt, 'sin fecha')}</Text>
        </View>
        {staleData ? (
          <InlineNotice
            title="Base posiblemente vieja"
            body="Si hoy vas a probar en tiendas, revisá el remoto antes de salir o puede que evalúes promos vencidas."
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

      <SectionHeader title="Transparencia" subtitle="Tenés que entenderlo antes de abrir la app de pago." />
      <Card style={styles.card}>
        <Text style={styles.help}>Paga Menos muestra ahorro estimado y condiciones relevantes antes de abrir la app de pago.</Text>
        <Text style={styles.help}>Si depende del día, tope o condición rara, te lo marcamos antes.</Text>
        <Text style={styles.help}>La idea es ayudarte a elegir, no empujarte a pagar algo que no entendiste.</Text>
      </Card>

      <SectionHeader title="Modo avanzado" subtitle="Controles extra para probar cálculo y apertura de apps." />
      <Card style={styles.card}>
        <ToggleRow
          title="Debug visible"
          body="Muestra detalles extra en resultados y habilita evidencia técnica."
          value={settings.debugEnabled}
          onValueChange={(value) => updateSettings({ debugEnabled: value })}
        />
        <ToggleRow
          title="Modo avanzado"
          body="Activa superficies y controles experimentales."
          value={settings.advancedMode}
          onValueChange={(value) => updateSettings({ advancedMode: value })}
        />
        <Text style={styles.help}>Paga Menos muestra ahorro estimado y condiciones. No confirma pagos reales.</Text>
      </Card>

      <SectionHeader title="Eventos recientes" subtitle="Registro corto de actualizaciones, QR, detecciones y aperturas de apps." />
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
          <Text style={styles.help}>Todavía no hay eventos guardados. Escaneá un QR o revisá descuentos para generar evidencia.</Text>
        )}
        <SecondaryButton onPress={() => void clearDiagnostics()}>Limpiar eventos</SecondaryButton>
      </Card>

      <SectionHeader title="Comercios guardados" subtitle="Accesos rápidos para reuso frecuente." />
      <Card style={styles.card}>
        <View style={styles.chips}>
          {settings.savedMerchants.length > 0 ? settings.savedMerchants.map((merchant) => (
            <Chip
              key={merchant}
              label={merchant}
              selected
              onPress={() => updateSettings({ savedMerchants: settings.savedMerchants.filter((item) => item !== merchant) })}
            />
          )) : <Text style={styles.help}>Todavía no guardaste comercios para reuso rápido.</Text>}
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
  trustCard: {
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
  },
  trustHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  trustIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  trustCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  trustTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  trustBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  trustGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  trustPill: {
    flex: 1,
    minWidth: 116,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  trustPillValue: {
    ...typography.caption,
    color: colors.ink,
  },
  trustPillLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountAvatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  accountCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  accountName: {
    ...typography.headingSm,
    color: colors.ink,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
