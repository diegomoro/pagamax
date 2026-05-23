import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompactRecommendationRow, HeroRecommendationCard } from '@/components/recommendation-card';
import { EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { buildRecommendationPresentation, sortRecommendationsForMode } from '@/lib/experience';
import { buildPaymentHandoffPlan, openPaymentApp } from '@/lib/handoff';
import { formatArs } from '@/lib/format';
import { colors, spacing, typography } from '@/lib/theme';
import type { RecommendationSession } from '@/types/app';

function formatDateLabel(raw: string | null): string {
  if (!raw) return 'hoy';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('es-AR');
}

function formatQrMeta(session: RecommendationSession): string | null {
  const parts = [
    session.match.qr.payment_provider ? `QR ${session.match.qr.payment_provider}` : null,
    session.match.qr.qr_type !== 'unknown' ? session.match.qr.qr_type : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' - ') : null;
}

export default function ResultsScreen() {
  const { currentSession, dataTimestamp, loading, recordHandoff, settings } = usePagamax();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const insets = useSafeAreaInsets();

  if (loading) {
    return <LoadingBlock label="Preparando recomendaciones..." />;
  }

  if (!currentSession) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState title="Todavia no hay resultados" body="Escanea un QR o elige un comercio y monto para ver el ranking." />
      </View>
    );
  }

  const ranked = sortRecommendationsForMode(currentSession, settings.optimizationMode).slice(0, 5);
  const [hero, ...rest] = ranked;
  const heroPresentation = hero ? buildRecommendationPresentation(currentSession, hero) : null;
  const handoffPlan = hero ? buildPaymentHandoffPlan(currentSession, hero) : null;
  const qrMeta = formatQrMeta(currentSession);
  const alternativeCount = rest.length;

  const handleOpen = async () => {
    if (!hero || !handoffPlan) return;

    try {
      const mode = await openPaymentApp(hero.method.provider, {
        merchantName: currentSession.match.merchant_name,
        amountArs: currentSession.amountEstimated ? undefined : currentSession.amountArs,
        qrPayload: currentSession.qrPayload,
      });
      recordHandoff(hero.method.provider, mode, handoffPlan.detail);
      if (mode === 'store') {
        Alert.alert('Se abrio Google Play', `No se pudo abrir ${handoffPlan.label} en este telefono.`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo abrir la app seleccionada.';
      recordHandoff(hero.method.provider, 'error', message);
      Alert.alert('No se pudo abrir la app', message);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        keyExtractor={(item) => `${item.method.id}-${item.promo.promo_key}`}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.kicker}>La mejor forma de pagar ahora</Text>
            <Text style={styles.merchant}>{currentSession.match.merchant_name}</Text>
            <Text style={styles.amount}>
              {currentSession.amountEstimated ? 'QR sin monto - ranking estimado' : `${formatArs(currentSession.amountArs)} - ${currentSession.source === 'scan' ? 'QR' : currentSession.source === 'online' ? 'link de pago' : 'manual'}`}
            </Text>
            {qrMeta ? <Text style={styles.amount}>{qrMeta}</Text> : null}

            {currentSession.amountEstimated ? (
              <Pressable
                style={styles.estimatedNotice}
                onPress={() => router.push({
                  pathname: '/manual',
                  params: {
                    merchant: currentSession.match.merchant_name,
                    amount: String(currentSession.amountArs),
                  },
                })}
              >
                <Text style={styles.estimatedTitle}>No habia monto en el QR</Text>
                <Text style={styles.estimatedBody}>Te muestro la mejor ruta con $45.000 de referencia. Toca aca si quieres ajustar el total.</Text>
              </Pressable>
            ) : null}

            {hero && heroPresentation && handoffPlan ? (
              <HeroRecommendationCard
                recommendation={hero}
                confidence={heroPresentation.confidence}
                grossSavingsArs={heroPresentation.grossSavingsArs}
                pagamaxFeeArs={heroPresentation.pagamaxFeeArs}
                netSavingsArs={heroPresentation.netSavingsArs}
                qualifiers={heroPresentation.qualifiers}
                dataDateLabel={formatDateLabel(dataTimestamp)}
                primaryLabel={handoffPlan.primaryLabel}
                onPressDetails={() => router.push({ pathname: '/detail', params: { index: '0' } })}
                onPressPrimary={() => void handleOpen()}
              />
            ) : (
              <EmptyState title="No encontramos opciones elegibles" body="Prueba con otro monto, activa mas medios o corrige el comercio." />
            )}

            {handoffPlan ? (
              <InlineNotice
                title={handoffPlan.confidenceLabel}
                body={`${handoffPlan.instruction} ${handoffPlan.supportsQrPayload || handoffPlan.supportsAmount ? 'Puede recibir datos del QR.' : 'No envia QR ni monto automaticamente.'}`}
              />
            ) : null}

            {settings.debugEnabled ? (
              <InlineNotice
                title="Debug"
                body={`match=${currentSession.match.match_method} | qr_amount=${currentSession.match.qr.amount_ars ?? 'null'} | filtros=${currentSession.match.filters_applied.join(', ') || 'ninguno'}`}
              />
            ) : null}

            {alternativeCount > 0 ? (
              <Pressable onPress={() => setShowAlternatives((prev) => !prev)} style={styles.alternativesToggle}>
                <View style={styles.alternativesCopy}>
                  <Text style={styles.alternativesTitle}>Otras opciones ({alternativeCount})</Text>
                  <Text style={styles.alternativesBody}>Solo si quieres comparar.</Text>
                </View>
                <Text style={styles.alternativesAction}>{showAlternatives ? 'Ocultar' : 'Ver'}</Text>
              </Pressable>
            ) : null}
          </View>
        }
        data={showAlternatives ? rest : []}
        renderItem={({ item, index }) => {
          const presentation = buildRecommendationPresentation(currentSession, item);
          return (
            <CompactRecommendationRow
              rank={index + 2}
              recommendation={item}
              netSavingsArs={presentation.netSavingsArs}
              delay={80 * (index + 1)}
              onPress={() => router.push({ pathname: '/detail', params: { index: String(index + 1) } })}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListFooterComponent={
          <View style={styles.footerLinks}>
            <Pressable onPress={() => router.replace('/scan')}>
              <Text style={styles.footerLink}>Escanear otro QR</Text>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/success', params: { index: '0' } })}>
              <Text style={styles.footerLink}>Marcar ahorro</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  headerWrap: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  kicker: {
    ...typography.overline,
    color: colors.teal,
  },
  merchant: {
    ...typography.headingLg,
    color: colors.ink,
  },
  amount: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  estimatedNotice: {
    borderRadius: spacing.md,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
  estimatedTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  estimatedBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  alternativesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  alternativesCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  alternativesTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  alternativesBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  alternativesAction: {
    ...typography.headingSm,
    color: colors.accentPressed,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  footerLink: {
    ...typography.headingSm,
    color: colors.accentPressed,
  },
  emptyWrap: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
});

