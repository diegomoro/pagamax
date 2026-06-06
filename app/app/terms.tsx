import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, IconButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { LEGAL_LINKS } from '@/config/public-build';
import { colors, spacing, typography } from '@/lib/theme';

export default function TermsScreen() {
  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Terminos</Text>
        <View style={styles.placeholder} />
      </View>
      <Card style={styles.card}>
        <Text style={styles.heading}>Herramienta independiente</Text>
        <Text style={styles.body}>Paga Menos compara opciones y abre apps de pago. No procesa, mueve, custodia ni confirma dinero.</Text>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.heading}>Estimaciones</Text>
        <Text style={styles.body}>Los descuentos dependen de terminos de bancos, billeteras, comercios, topes, fechas y validacion final dentro de cada app de pago.</Text>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.heading}>Ofertas pagas</Text>
        <Text style={styles.body}>Si un comercio o emisor paga por aparecer, se marca de forma separada. La recomendacion principal debe priorizar utilidad para el usuario.</Text>
      </Card>
      <SecondaryButton onPress={() => void Linking.openURL(LEGAL_LINKS.terms)}>Abrir términos públicos</SecondaryButton>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placeholder: { width: 44 },
  title: { ...typography.headingLg, color: colors.ink },
  card: { gap: spacing.sm },
  heading: { ...typography.headingSm, color: colors.ink },
  body: { ...typography.bodySm, color: colors.inkMuted },
});
