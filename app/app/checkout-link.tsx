import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { inferMerchantFromCheckoutUrl } from '@/lib/demo-data';
import { parseAmountInput } from '@/lib/format';
import { IconButton, PageTitle, ScreenScroll, StickyButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function CheckoutLinkScreen() {
  const { runCheckoutRecommendation } = usePagamax();
  const [urlInput, setUrlInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [merchantOverride, setMerchantOverride] = useState('');

  const detectedMerchant = useMemo(() => inferMerchantFromCheckoutUrl(urlInput), [urlInput]);
  const amountArs = parseAmountInput(amountInput);
  const effectiveMerchant = merchantOverride.trim() || detectedMerchant || '';
  const canSubmit = Boolean(urlInput.trim() && amountArs && effectiveMerchant);

  const submit = () => {
    if (!amountArs) {
      Alert.alert('Monto invalido', 'Ingresa un monto positivo para comparar el link de pago.');
      return;
    }

    try {
      runCheckoutRecommendation(urlInput.trim(), amountArs, merchantOverride.trim() || undefined);
      router.replace('/results');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo interpretar el link de pago.';
      Alert.alert('Error', message);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-back" onPress={() => router.back()} />
        </View>

        <PageTitle title="Pegar link de pago" subtitle="Usa esta ruta para compras online donde quieras comparar antes de pagar." />

        <View style={styles.card}>
          <Text style={styles.label}>URL del link de pago</Text>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://..."
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={styles.label}>Comercio</Text>
          <TextInput
            style={styles.input}
            value={merchantOverride}
            onChangeText={setMerchantOverride}
            placeholder={detectedMerchant || 'Detectado desde el link o ingresalo manualmente'}
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={styles.label}>Monto</Text>
          <TextInput
            style={styles.input}
            value={amountInput}
            onChangeText={setAmountInput}
            keyboardType="numeric"
            placeholder="30000"
            placeholderTextColor={colors.inkMuted}
          />

          {detectedMerchant ? <Text style={styles.detected}>Comercio detectado: {detectedMerchant}</Text> : null}
        </View>
      </ScreenScroll>

      <StickyButton
        label="Ver mejor ruta"
        preview={canSubmit ? `Buscar mejor ruta para ${effectiveMerchant}` : 'Pega un link de pago, comercio y monto'}
        disabled={!canSubmit}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 164,
    gap: spacing.lg,
  },
  topBar: {
    marginTop: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodyLg,
  },
  detected: {
    ...typography.bodySm,
    color: colors.teal,
  },
});
