import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card, InlineNotice, LoadingBlock, PageTitle, Pill, PrimaryButton, ScreenScroll, SectionTitle, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { formatArs } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

const DEMO_QR = '000201010211520454115802AR5905Jumbo6004CABA5406300006304FFFF';

export default function HomeScreen() {
  const { activeMethodsCount, currentSession, dataTimestamp, error, loading, prepareScan, promoIndex, runPendingScanRecommendation } = usePagamax();

  if (loading) {
    return <LoadingBlock label="Cargando índice local de promociones..." />;
  }

  if (error || !promoIndex) {
    return (
      <ScreenScroll>
        <PageTitle title="PagaMax Beta" subtitle="Android MVP sin backend" />
        <InlineNotice title="No se pudieron cargar los datos" body={error ?? 'Verificá el bundle local e intentá nuevamente.'} tone="warning" />
      </ScreenScroll>
    );
  }

  const runDemo = () => {
    prepareScan(DEMO_QR);
    runPendingScanRecommendation(30000);
    router.push('/results');
  };

  return (
    <ScreenScroll>
      <PageTitle title="PagaMax Beta" subtitle="Compará promociones reales antes de pagar." />

      <Card>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Top 5 métodos para un comercio y monto concretos.</Text>
            <Text style={styles.heroBody}>
              El cálculo corre en el teléfono con el snapshot local de promociones. No hacemos pagos ni accedemos a tu cuenta.
            </Text>
          </View>
          <Pill label={`${promoIndex.stats?.active_rows ?? promoIndex.promos.length} promos activas`} tone="accent" />
        </View>

        <PrimaryButton onPress={() => router.push('/scan')}>Escanear QR</PrimaryButton>
        <SecondaryButton onPress={() => router.push('/manual')}>Elegir comercio y monto</SecondaryButton>
      </Card>

      <Card>
        <SectionTitle>Estado de la beta</SectionTitle>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{activeMethodsCount}</Text>
            <Text style={styles.metricLabel}>métodos activos</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{promoIndex.stats?.names_with_promos ?? 0}</Text>
            <Text style={styles.metricLabel}>comercios indexados</Text>
          </View>
        </View>
        <InlineNotice
          title="Datos locales"
          body={`Última generación del índice: ${dataTimestamp ?? 'sin fecha'}. El ahorro siempre se muestra como estimado.`}
        />
      </Card>

      <Card>
        <SectionTitle>Prueba rápida</SectionTitle>
        <Text style={styles.quickTitle}>Demo con Jumbo y $30.000</Text>
        <Text style={styles.quickBody}>
          Úsalo para comprobar que el índice, el matching QR y el ranking siguen funcionando en el dispositivo.
        </Text>
        <SecondaryButton onPress={runDemo}>Correr demo integrada</SecondaryButton>
        {currentSession ? (
          <Text style={styles.lastRun}>
            Último cálculo: {currentSession.match.merchant_name} • {formatArs(currentSession.amountArs)}
          </Text>
        ) : null}
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  heroHeader: {
    gap: spacing.md,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
  },
  heroBody: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metric: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    gap: 2,
  },
  metricValue: {
    color: colors.teal,
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  quickTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  quickBody: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  lastRun: {
    color: colors.inkMuted,
    fontSize: 13,
  },
});
