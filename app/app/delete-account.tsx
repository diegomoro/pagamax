import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, IconButton, InlineNotice, PrimaryButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { LEGAL_LINKS } from '@/config/public-build';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing, typography } from '@/lib/theme';

export default function DeleteAccountScreen() {
  const { account, deleteAccount } = usePagamax();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    Alert.alert('Eliminar cuenta', 'Se borran cuenta, historial, métodos, diagnósticos y preferencias de este teléfono. Si el backend está configurado, también se crea la solicitud remota.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void deleteAccount()
            .then(() => router.replace('/account'))
            .catch((error: unknown) => {
              Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Intentalo de nuevo.');
            })
            .finally(() => setDeleting(false));
        },
      },
    ]);
  };

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Eliminar cuenta</Text>
        <View style={styles.placeholder} />
      </View>
      <Card style={styles.card}>
        <Text style={styles.heading}>{account ? account.email : 'Sin cuenta activa'}</Text>
        <Text style={styles.body}>Google Play requiere un camino dentro de la app y otro web para pedir la eliminación de cuenta y datos asociados.</Text>
        <Text style={styles.body}>Podemos retener registros mínimos de seguridad, fraude o cumplimiento cuando la política publicada lo permita.</Text>
      </Card>
      {!account ? <InlineNotice title="No hay cuenta local" body="Este teléfono no tiene una cuenta guardada ahora." tone="warning" /> : null}
      <PrimaryButton onPress={handleDelete} disabled={!account || deleting} style={!account || deleting ? styles.disabled : undefined}>
        {deleting ? 'Eliminando...' : 'Eliminar cuenta y datos'}
      </PrimaryButton>
      <SecondaryButton onPress={() => void Linking.openURL(LEGAL_LINKS.accountDeletion)}>Abrir solicitud web</SecondaryButton>
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
  disabled: { opacity: 0.45 },
});
