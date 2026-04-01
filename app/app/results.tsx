import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { RecommendationCard } from '@/components/recommendation-card';
import { Card, EmptyState, InlineNotice, LoadingBlock, PageTitle, Pill, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { getPaymentAppConfig } from '@/config/payment-apps';
import { openPaymentApp } from '@/lib/handoff';
import { formatArs } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function ResultsScreen() {
  const { currentSession, loading, settings } = usePagamax();

  if (loading) {
    return <LoadingBlock label="Preparando recomendaciones..." />;
  }

  if (!currentSession) {
    return (
      <ScreenScroll>
        <EmptyState title="Todavía no hay resultados" body="Escaneá un QR o elegí un comercio y monto para ver el ranking." />
        <SecondaryButton onPress={() => router.replace('/')}>Volver al inicio</SecondaryButton>
      </ScreenScroll>
    );
  }

  const handleOpen = async (provider: string) => {
    try {
      const mode = await openPaymentApp(provider);
      if (mode === 'store') {
        const config = getPaymentAppConfig(provider);
        Alert.alert('Fallback a Play Store', `No hay deep link verificado para ${config.label}. Se abrió la ficha o búsqueda en Google Play.`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo abrir la app seleccionada.';
      Alert.alert('Handoff falló', message);
    }
  };

  return (
    <ScreenScroll>
      <PageTitle
        title={currentSession.match.merchant_name}
        subtitle={`Monto analizado: ${formatArs(currentSession.amountArs)} • ${currentSession.source === 'scan' ? 'Flujo QR' : 'Ingreso manual'}`}
      />

      <Card>
        <View style={styles.headerRow}>
          <Pill label={`Match: ${currentSession.match.match_method}`} tone="accent" />
          <Pill label={`${currentSession.recommendations.length} opciones`} />
        </View>
        <Text style={styles.caption}>Siempre mostramos ahorro estimado. Revisá topes, fechas y advertencias antes de pagar.</Text>
      </Card>

      {currentSession.recommendations.length === 0 ? (
        <EmptyState
          title="No encontramos opciones elegibles"
          body="Probá con otro monto, activá más métodos o cambiá el comercio si el QR estaba mal resuelto."
        />
      ) : (
        currentSession.recommendations.slice(0, 5).map((recommendation, index) => {
          const config = getPaymentAppConfig(recommendation.method.provider);
          return (
            <RecommendationCard
              key={`${recommendation.method.id}-${recommendation.promo.promo_key}`}
              recommendation={recommendation}
              appLabel={`App sugerida: ${config.label}`}
              handoffLabel={config.verifiedDeepLink ? `Abrir ${config.label}` : `Buscar ${config.label}`}
              onPressDetails={() => router.push({ pathname: '/detail', params: { index: String(index) } })}
              onPressHandoff={() => void handleOpen(recommendation.method.provider)}
            />
          );
        })
      )}

      {settings.debugEnabled ? (
        <InlineNotice
          title="Debug"
          body={`QR amount=${currentSession.match.qr.amount_ars ?? 'null'} | filtros=${currentSession.match.filters_applied.join(', ') || 'ninguno'}`}
        />
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  caption: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
