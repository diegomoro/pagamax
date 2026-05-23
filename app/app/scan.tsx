import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLockup } from '@/components/brand-lockup';
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/ui';
import { ScanOverlay } from '@/components/scan-overlay';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

function triggerHaptic(effect: Promise<void>): void {
  void effect.catch(() => {
    // QR handling should not depend on native haptic feedback completing.
  });
}

export default function ScanScreen() {
  const { runScanRecommendation, settings } = usePagamax();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);
  const insets = useSafeAreaInsets();

  const continueWithPayload = async (payload: string) => {
    try {
      runScanRecommendation(payload);
      setLocked(true);
      setFeedback('success');
      triggerHaptic(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      router.replace('/results');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo interpretar el QR.';
      setFeedback('error');
      triggerHaptic(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
      setTimeout(() => setFeedback(null), 450);
      Alert.alert('QR invalido', message);
      setLocked(false);
    }
  };

  const onBarcodeScanned = (event: BarcodeScanningResult) => {
    if (locked || !event.data) return;
    void continueWithPayload(event.data);
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permissionScreen}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Activa la camara para escanear rapido</Text>
          <Text style={styles.permissionBody}>
            La camara se usa solo mientras esta pantalla esta abierta. Si prefieres no dar permiso, puedes buscar el comercio manualmente.
          </Text>
          <PrimaryButton onPress={() => void requestPermission()}>Dar permiso de camara</PrimaryButton>
          <SecondaryButton onPress={() => router.replace('/manual')}>Buscar comercio</SecondaryButton>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onBarcodeScanned}
      />

      <ScanOverlay success={feedback === 'success'} error={feedback === 'error'} />

      {feedback ? <View style={[styles.flash, feedback === 'success' ? styles.flashSuccess : styles.flashError]} /> : null}

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
        <IconButton icon="arrow-back" tone="light" onPress={() => router.back()} />
      </View>

      <View style={[styles.brandWrap, { top: insets.top + spacing.sm }]}>
        <BrandLockup compact showTagline={false} />
      </View>

      <View style={styles.bottomCard}>
        <Pressable hitSlop={12} onPress={() => router.replace('/manual')}>
          <Text style={styles.bottomLink}>No ves el QR? Busca el comercio</Text>
        </Pressable>

        {settings.debugEnabled ? (
          <>
            <Pressable onPress={() => setShowPaste((prev) => !prev)}>
              <Text style={styles.debugToggle}>{showPaste ? 'Ocultar QR pegado' : 'Pegar QR'}</Text>
            </Pressable>

            {showPaste ? (
              <View style={styles.pasteBox}>
                <TextInput
                  style={styles.pasteInput}
                  multiline
                  numberOfLines={4}
                  value={pasteValue}
                  onChangeText={setPasteValue}
                  placeholder="Pega aqui el payload EMVCo"
                  placeholderTextColor={colors.inkMuted}
                />
                <SecondaryButton onPress={() => void continueWithPayload(pasteValue.trim())}>Procesar QR</SecondaryButton>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: spacing.md,
    zIndex: 20,
    elevation: 20,
  },
  brandWrap: {
    position: 'absolute',
    top: 56,
    left: 72,
    right: spacing.md,
    zIndex: 20,
    elevation: 20,
  },
  bottomCard: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
    backgroundColor: 'rgba(255, 250, 242, 0.94)',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 20,
    elevation: 20,
  },
  bottomLink: {
    ...typography.headingSm,
    color: colors.ink,
    textAlign: 'center',
  },
  debugToggle: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  pasteBox: {
    gap: spacing.sm,
  },
  pasteInput: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceElevated,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
    ...typography.bodySm,
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  permissionCard: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  permissionTitle: {
    ...typography.displaySm,
    color: colors.ink,
  },
  permissionBody: {
    ...typography.bodyLg,
    color: colors.inkMuted,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
  },
  flashSuccess: {
    backgroundColor: 'rgba(37, 93, 98, 0.22)',
  },
  flashError: {
    backgroundColor: 'rgba(141, 36, 54, 0.22)',
  },
});
