import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { Card, InlineNotice, LoadingBlock, PageTitle, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing } from '@/lib/theme';

const PRIVACY_POLICY_URL = 'https://github.com/diegomoro/pagamax/blob/main/app/PRIVACY_POLICY.md';

export default function SettingsScreen() {
  const { dataTimestamp, loading, refreshData, settings, setDebugEnabled } = usePagamax();

  if (loading) {
    return <LoadingBlock label="Cargando ajustes..." />;
  }

  return (
    <ScreenScroll>
      <PageTitle title="Ajustes" subtitle="Sin tracking, sin backend y sin permisos ocultos." />

      <Card>
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.title}>Modo debug</Text>
            <Text style={styles.body}>Muestra raw QR, filtros aplicados y JSON resumido en resultados.</Text>
          </View>
          <Switch value={settings.debugEnabled} onValueChange={setDebugEnabled} />
        </View>
      </Card>

      <Card>
        <Text style={styles.title}>Datos locales</Text>
        <Text style={styles.body}>Índice cargado: {dataTimestamp ?? 'sin fecha disponible'}.</Text>
        <SecondaryButton onPress={() => void refreshData()}>Recargar bundle local</SecondaryButton>
      </Card>

      <InlineNotice
        title="Descargo"
        body="PagaMax no realiza pagos ni accede a datos financieros. Solo compara promociones con ahorro estimado."
      />

      <Card>
        <Text style={styles.title}>Privacidad y publicación</Text>
        <Text style={styles.body}>Para Google Play hace falta una política pública. Esta URL apunta al archivo versionado en GitHub.</Text>
        <SecondaryButton onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>Abrir política de privacidad</SecondaryButton>
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
