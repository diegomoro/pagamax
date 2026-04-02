import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { DEMO_ACTIVITY, DEMO_MISSED_OPPORTUNITIES, DEMO_OPPORTUNITIES, DEMO_REPEAT_MERCHANTS } from '@/lib/demo-data';
import { summarizeActivity } from '@/lib/experience';
import { ActivityItem } from '@/components/activity-item';
import { BottomSheet, Card, IconButton, InlineNotice, LoadingBlock, PrimaryButton, ScreenScroll, SecondaryButton, ToggleRow } from '@/components/ui';
import { MerchantCard } from '@/components/merchant-card';
import { SavingsSummaryCard } from '@/components/savings-summary-card';
import { SectionHeader } from '@/components/section-header';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing, typography } from '@/lib/theme';

const PRIVACY_POLICY_URL = 'https://github.com/diegomoro/pagamax/blob/main/app/PRIVACY_POLICY.md';

function formatDateLabel(raw: string | null): string {
  if (!raw) return 'sin fecha';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('es-AR');
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buen dia';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomeScreen() {
  const {
    activity,
    activeMethodsCount,
    currentSession,
    dataTimestamp,
    error,
    loading,
    methods,
    promoIndex,
    settings,
    toggleSavedMerchant,
    updateSettings,
  } = usePagamax();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!loading && !settings.onboardingCompleted) {
      router.replace('/onboarding');
    }
  }, [loading, settings.onboardingCompleted]);

  if (loading) {
    return <LoadingBlock label="Cargando Pagamax..." />;
  }

  if (error || !promoIndex) {
    return (
      <ScreenScroll>
        <InlineNotice title="No se pudieron cargar los datos" body={error ?? 'Verifica el bundle local e intenta nuevamente.'} tone="warning" />
      </ScreenScroll>
    );
  }

  const liveActivity = activity.length > 0 ? activity : DEMO_ACTIVITY;
  const summary = summarizeActivity(liveActivity);
  const mostUsefulCategory = liveActivity[0]?.category ?? 'Supermercados';
  const recentMerchantNames = Array.from(new Set([
    ...settings.savedMerchants,
    ...liveActivity.slice(0, 4).map((item) => item.merchantName),
    ...DEMO_REPEAT_MERCHANTS,
  ])).slice(0, 4);

  return (
    <>
      <ScreenScroll contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.wordmark}>Pagamax</Text>
          </View>
          <IconButton icon="options-outline" onPress={() => setSettingsOpen(true)} />
        </View>

        <Text style={styles.subhead}>Pon Pagamax delante del pago y decide con claridad en menos de medio minuto.</Text>

        <Card elevated style={styles.actionCard}>
          <View style={styles.actionRow}>
            <View style={styles.actionPrimary}>
              <PrimaryButton onPress={() => router.push('/scan')}>Check a payment</PrimaryButton>
            </View>
            <View style={styles.actionSecondary}>
              <SecondaryButton onPress={() => router.push('/checkout-link')}>Paste checkout link</SecondaryButton>
            </View>
          </View>
          <View style={styles.microActions}>
            <Pressable onPress={() => router.push('/opportunities')}>
              <Text style={styles.microAction}>Nearby opportunities</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/history')}>
              <Text style={styles.microAction}>Recent merchants</Text>
            </Pressable>
          </View>
          <Text style={styles.trustLine}>
            {(promoIndex.stats?.active_rows ?? promoIndex.promos.length).toLocaleString('es-AR')} promos de {new Set(promoIndex.promos.map((promo) => promo.issuer)).size} emisores · todo offline
          </Text>
        </Card>

        <View style={styles.summaryRow}>
          <SavingsSummaryCard
            icon="calendar-outline"
            label="Saved this month"
            value={`$${summary.monthlyNetSavingsArs.toLocaleString('es-AR')}`}
            footnote="neto para vos"
            tone="teal"
          />
          <SavingsSummaryCard
            icon="wallet-outline"
            label="Lifetime net savings"
            value={`$${summary.lifetimeNetSavingsArs.toLocaleString('es-AR')}`}
            footnote="con fee visible"
          />
          <SavingsSummaryCard
            icon="sparkles-outline"
            label="Most useful category"
            value={mostUsefulCategory}
            footnote={`${activeMethodsCount} medios activos`}
            tone="accent"
          />
        </View>

        {currentSession ? (
          <>
            <SectionHeader title="Current best route" subtitle="Retoma el ultimo analisis sin volver a escanear." />
            <ActivityItem
              item={{
                id: 'current-session',
                merchantName: currentSession.match.merchant_name,
                category: currentSession.recommendations[0]?.promo.category || 'General',
                amountArs: currentSession.amountArs,
                grossSavingsArs: Math.round(currentSession.recommendations[0]?.estimatedSavingsArs ?? 0),
                pagamaxFeeArs: Math.round((currentSession.recommendations[0]?.estimatedSavingsArs ?? 0) * 0.16),
                netSavingsArs: Math.round((currentSession.recommendations[0]?.estimatedSavingsArs ?? 0) * 0.84),
                provider: currentSession.recommendations[0]?.method.provider ?? 'pagamax',
                methodLabel: currentSession.recommendations[0]?.method.label ?? 'Sin ruta',
                confidence: {
                  label: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'Alta' : 'Media',
                  score: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 0.9 : 0.72,
                  tone: currentSession.match.match_method === 'cuit' || currentSession.match.match_method === 'name_exact' ? 'success' : 'warning',
                  note: 'Revisa detalle, fee y caveats antes de seguir.',
                },
                createdAt: currentSession.createdAt,
                source: currentSession.source,
              }}
              onPress={() => router.push('/results')}
            />
          </>
        ) : null}

        <SectionHeader
          title="Repeat merchants"
          subtitle="Atajos para comercios donde Pagamax suele rendir."
          actionLabel="Ver historial"
          onPressAction={() => router.push('/history')}
        />
        <View style={styles.repeatRow}>
          {recentMerchantNames.map((merchant) => (
            <Pressable
              key={merchant}
              style={styles.repeatPill}
              onPress={() => router.push({ pathname: '/manual', params: { merchant } })}
              onLongPress={() => toggleSavedMerchant(merchant)}
            >
              <Text style={styles.repeatLabel}>{merchant}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader
          title="Likely opportunities today"
          subtitle="Valor esperado segun tus medios y categorias mas frecuentes."
          actionLabel="See all"
          onPressAction={() => router.push('/opportunities')}
        />
        {DEMO_OPPORTUNITIES.slice(0, 2).map((merchant) => (
          <MerchantCard
            key={merchant.id}
            merchant={merchant}
            onPress={() => router.push({ pathname: '/manual', params: { merchant: merchant.merchantName } })}
          />
        ))}

        <SectionHeader title="Recent activity" subtitle="Ultimos pagos donde Pagamax encontro valor." actionLabel="Open history" onPressAction={() => router.push('/history')} />
        {liveActivity.slice(0, 2).map((item) => (
          <ActivityItem key={item.id} item={item} onPress={() => router.push('/history')} />
        ))}

        {DEMO_MISSED_OPPORTUNITIES[0] ? (
          <InlineNotice
            title="Missed opportunity"
            body={`${DEMO_MISSED_OPPORTUNITIES[0].merchantName}: ${DEMO_MISSED_OPPORTUNITIES[0].note} Valor estimado perdido $${DEMO_MISSED_OPPORTUNITIES[0].estimatedNetSavingsArs.toLocaleString('es-AR')}.`}
            tone="warning"
          />
        ) : null}

        <Text style={styles.footerNote}>Datos actualizados al {formatDateLabel(dataTimestamp)}. Fees, ahorro y confianza se muestran de forma transparente.</Text>
      </ScreenScroll>

      <BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} title="Control center">
        <ToggleRow
          title="Optimization mode"
          body={settings.optimizationMode === 'max_savings' ? 'Priorizando ahorro neto.' : 'Priorizando rapidez y menos friccion.'}
          value={settings.optimizationMode === 'fastest_checkout'}
          onValueChange={(value) => updateSettings({ optimizationMode: value ? 'fastest_checkout' : 'max_savings' })}
        />
        <ToggleRow
          title="Notifications"
          body="Avisos para oportunidades que superen tu umbral."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
        <ToggleRow
          title="Nearby insights"
          body="Sugerencias de comercios cercanos cuando agreguen valor."
          value={settings.locationInsightsEnabled}
          onValueChange={(value) => updateSettings({ locationInsightsEnabled: value })}
        />
        <SecondaryButton onPress={() => router.push('/profile')}>Open preferences</SecondaryButton>
        <SecondaryButton onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>Privacy policy</SecondaryButton>
        <Text style={styles.sheetFootnote}>{methods.length} medios configurados · umbral ${settings.alertThresholdArs.toLocaleString('es-AR')}</Text>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 132,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  wordmark: {
    ...typography.displayLg,
    color: colors.ink,
  },
  subhead: {
    ...typography.bodyLg,
    color: colors.inkMuted,
    maxWidth: 320,
  },
  actionCard: {
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionPrimary: {
    flex: 3,
  },
  actionSecondary: {
    flex: 2,
  },
  microActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  microAction: {
    ...typography.caption,
    color: colors.accentPressed,
  },
  trustLine: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  repeatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  repeatPill: {
    borderRadius: 999,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  repeatLabel: {
    ...typography.headingSm,
    color: colors.ink,
  },
  footerNote: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  sheetFootnote: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
