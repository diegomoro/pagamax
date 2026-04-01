import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, InlineNotice, PageTitle, Pill, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { getPaymentAppConfig } from '@/config/payment-apps';
import { openPaymentApp } from '@/lib/handoff';
import { formatArs } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function DetailScreen() {
  const { currentSession } = usePagamax();
  const params = useLocalSearchParams<{ index?: string }>();

  const recommendation = useMemo(() => {
    const index = Number(params.index ?? '0');
    if (!currentSession || !Number.isFinite(index)) return null;
    return currentSession.recommendations[index] ?? null;
  }, [currentSession, params.index]);

  if (!currentSession || !recommendation) {
    return (
      <ScreenScroll>
        <EmptyState title="No hay detalle cargado" body="Volvé a resultados y elegí una recomendación." />
      </ScreenScroll>
    );
  }

  const config = getPaymentAppConfig(recommendation.method.provider);

  return (
    <ScreenScroll>
      <PageTitle title={recommendation.method.label} subtitle={recommendation.promo.promo_title} />

      <Card>
        <View style={styles.valueRow}>
          <View>
            <Text style={styles.amount}>{formatArs(recommendation.estimatedSavingsArs)}</Text>
            <Text style={styles.caption}>Ahorro estimado</Text>
          </View>
          <Pill label={recommendation.source === 'merchant' ? 'Promoción del comercio' : 'Promoción general'} tone="accent" />
        </View>
        <Text style={styles.netPay}>Pago neto estimado: {formatArs(recommendation.estimatedNetPaymentArs)}</Text>
        <Text style={styles.description}>{recommendation.promo.description_short || 'Sin descripción corta disponible.'}</Text>
      </Card>

      <Card>
        <Text style={styles.blockTitle}>Por qué quedó arriba</Text>
        {recommendation.reasons.map(reason => (
          <Text key={reason} style={styles.listItem}>• {reason}</Text>
        ))}
      </Card>

      {recommendation.warnings.length > 0 ? (
        <InlineNotice title="Advertencias" body={recommendation.warnings.join(' • ')} tone="warning" />
      ) : null}

      <Card>
        <Text style={styles.blockTitle}>Reglas clave</Text>
        <Text style={styles.listItem}>• Emisor: {recommendation.promo.issuer}</Text>
        <Text style={styles.listItem}>• Días: {recommendation.promo.day_pattern}</Text>
        <Text style={styles.listItem}>• Canal: {recommendation.promo.channel}</Text>
        <Text style={styles.listItem}>• Rail: {recommendation.promo.rail}</Text>
        <Text style={styles.listItem}>• Tope: {recommendation.promo.cap_amount_ars ? formatArs(recommendation.promo.cap_amount_ars) : 'Sin tope explícito'}</Text>
        <Text style={styles.listItem}>• Mínimo: {recommendation.promo.min_purchase_ars ? formatArs(recommendation.promo.min_purchase_ars) : 'Sin mínimo explícito'}</Text>
        <Text style={styles.listItem}>• Vigencia: {recommendation.promo.valid_from || 'sin inicio'} → {recommendation.promo.valid_to || 'sin fin'}</Text>
      </Card>

      <SecondaryButton onPress={() => void openPaymentApp(recommendation.method.provider)}>
        {config.verifiedDeepLink ? `Abrir ${config.label}` : `Buscar ${config.label} en Play Store`}
      </SecondaryButton>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amount: {
    color: colors.teal,
    fontSize: 32,
    fontWeight: '900',
  },
  caption: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  netPay: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  description: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  blockTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  listItem: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
