import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { Card, InlineNotice, PageTitle, PrimaryButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing } from '@/lib/theme';

export default function ScanScreen() {
  const { prepareScan, runPendingScanRecommendation } = usePagamax();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  const continueWithPayload = (payload: string) => {
    try {
      const match = prepareScan(payload);
      setLocked(true);
      if (match.qr.amount_ars !== null) {
        runPendingScanRecommendation(match.qr.amount_ars);
        router.replace('/results');
        return;
      }
      router.replace('/manual');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo interpretar el QR.';
      Alert.alert('QR inválido', message);
      setLocked(false);
    }
  };

  const onBarcodeScanned = (event: BarcodeScanningResult) => {
    if (locked || !event.data) return;
    continueWithPayload(event.data);
  };

  return (
    <ScreenScroll>
      <PageTitle title="Escanear QR" subtitle="Permiso de cámara solo mientras esta pantalla está abierta." />

      {!permission?.granted ? (
        <Card>
          <InlineNotice
            title="Permiso requerido"
            body="La cámara se usa únicamente para leer códigos QR de comercios. Si no querés dar permiso, podés pegar el QR manualmente."
          />
          <PrimaryButton onPress={() => void requestPermission()}>Dar permiso de cámara</PrimaryButton>
        </Card>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcodeScanned}
          />
        </View>
      )}

      <Card>
        <Text style={styles.label}>Pegar QR para debug o fallback</Text>
        <TextInput
          style={styles.input}
          multiline
          numberOfLines={4}
          value={pasteValue}
          onChangeText={setPasteValue}
          placeholder="Pegá acá el payload EMVCo"
          placeholderTextColor={colors.inkMuted}
        />
        <SecondaryButton onPress={() => continueWithPayload(pasteValue.trim())}>Procesar QR pegado</SecondaryButton>
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  cameraWrap: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 360,
    backgroundColor: colors.surface,
  },
  camera: {
    minHeight: 360,
  },
  label: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fffdf8',
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
});
