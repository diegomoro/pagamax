import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, IconButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { LEGAL_LINKS } from '@/config/public-build';
import { colors, spacing, typography } from '@/lib/theme';

export default function SupportScreen() {
  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Soporte</Text>
        <View style={styles.placeholder} />
      </View>
      <Card style={styles.card}>
        <Text style={styles.heading}>Ayuda y revision</Text>
        <Text style={styles.body}>Para errores de descuentos, privacidad, eliminación de datos o problemas al abrir una billetera, mandá el comercio, monto aproximado, método elegido y versión de la app.</Text>
      </Card>
      <SecondaryButton onPress={() => void Linking.openURL(LEGAL_LINKS.support)}>Contactar soporte</SecondaryButton>
      <SecondaryButton onPress={() => router.push('/data-controls')}>Exportar diagnóstico</SecondaryButton>
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
