import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CompactRecommendationRow, HeroRecommendationCard } from '@/components/recommendation-card';
import { EmptyState, InlineNotice, LoadingBlock } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { buildRecommendationPresentation, sortRecommendationsForMode } from '@/lib/experience';
import { getPaymentAppConfig } from '@/config/payment-apps';
import { openPaymentApp } from '@/lib/handoff';
import { formatArs } from '@/lib/format';
import { colors, spacing, typography } from '@/lib/theme';

function formatDateLabel(raw: string | null): string {
  if (!raw) return 'hoy';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('es-AR');
}

export default function ResultsScreen() {
  const { currentSession, dataTimestamp, loading, settings } = usePagamax();

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

  const handleOpen = async (provider: string) => {
    try {
      const mode = await openPaymentApp(provider);
      if (mode === 'store') {
        const config = getPaymentAppConfig(provider);
        Alert.alert('Se abrio Google Play', `No hay deep link verificado para ${config.label}.`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo abrir la app seleccionada.';
      Alert.alert('No se pudo abrir la app', message);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={rest}
        keyExtractor={(item) => `${item.method.id}-${item.promo.promo_key}`}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.merchant}>{currentSession.match.merchant_name}</Text>
            <Text style={styles.amount}>{formatArs(currentSession.amountArs)} · {currentSession.source === 'scan' ? 'QR' : currentSession.source === 'online' ? 'checkout link' : 'manual'}</Text>

            {hero && heroPresentation ? (
              <HeroRecommendationCard
                recommendation={hero}
                confidence={heroPresentation.confidence}
                grossSavingsArs={heroPresentation.grossSavingsArs}
                pagamaxFeeArs={heroPresentation.pagamaxFeeArs}
                netSavingsArs={heroPresentation.netSavingsArs}
                qualifiers={heroPresentation.qualifiers}
                dataDateLabel={formatDateLabel(dataTimestamp)}
                handoffLabel={getPaymentAppConfig(hero.method.provider).verifiedDeepLink ? `Abrir ${getPaymentAppConfig(hero.method.provider).label}` : `Buscar ${getPaymentAppConfig(hero.method.provider).label}`}
                onPressDetails={() => router.push({ pathname: '/detail', params: { index: '0' } })}
                onPressHandoff={() => void handleOpen(hero.method.provider)}
                onPressPrimary={() => router.push({ pathname: '/success', params: { index: '0' } })}
              />
            ) : (
              <EmptyState title="No encontramos opciones elegibles" body="Prueba con otro monto, activa mas medios o corrige el comercio." />
            )}

            {settings.debugEnabled ? (
              <InlineNotice
                title="Debug"
                body={`match=${currentSession.match.match_method} | qr_amount=${currentSession.match.qr.amount_ars ?? 'null'} | filtros=${currentSession.match.filters_applied.join(', ') || 'ninguno'}`}
              />
            ) : null}
          </View>
        }
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
            <Pressable onPress={() => router.replace('/manual')}>
              <Text style={styles.footerLink}>Nueva busqueda</Text>
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
  merchant: {
    ...typography.headingLg,
    color: colors.ink,
  },
  amount: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
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
