import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, IconButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { LEGAL_LINKS } from '@/config/public-build';
import { colors, spacing, typography } from '@/lib/theme';

export default function PrivacyScreen() {
  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Privacidad</Text>
        <View style={styles.placeholder} />
      </View>
      <Card style={styles.card}>
        <Text style={styles.heading}>Qué guardamos</Text>
        <Text style={styles.body}>Cuenta, preferencias de medios de pago, comercios guardados, eventos de uso, diagnósticos técnicos y señales de recomendación como comercio, categoría, monto aproximado y app elegida.</Text>
        <Text style={styles.body}>No guardamos credenciales bancarias, números completos de tarjeta, biometría, contactos, SMS, notificaciones ni el QR completo por defecto.</Text>
      </Card>
      <Card style={styles.card}>
        <Text style={styles.heading}>Para qué lo usamos</Text>
        <Text style={styles.body}>Mejorar recomendaciones, detectar errores, evitar abuso, medir ofertas y preparar analítica agregada para comercios o emisores sin vender datos sensibles identificables.</Text>
      </Card>
      <SecondaryButton onPress={() => router.push('/data-controls')}>Configurar datos</SecondaryButton>
      <SecondaryButton onPress={() => void Linking.openURL(LEGAL_LINKS.privacyPolicy)}>Abrir política pública</SecondaryButton>
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
