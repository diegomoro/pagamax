import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, InlineNotice, PageTitle, PrimaryButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { parseAmountInput } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';

export default function ManualEntryScreen() {
  const { merchantOptions, pendingScan, runManualRecommendation, runPendingScanRecommendation } = usePagamax();
  const [amountInput, setAmountInput] = useState('');
  const [merchantInput, setMerchantInput] = useState(pendingScan?.match.merchant_name ?? '');
  const [allowOverride, setAllowOverride] = useState(!pendingScan || pendingScan.match.match_method === 'none');

  const suggestions = useMemo(() => {
    const query = merchantInput.trim().toLowerCase();
    if (!query) return merchantOptions.slice(0, 12);
    return merchantOptions
      .filter(option => option.name.toLowerCase().includes(query))
      .slice(0, 12);
  }, [merchantInput, merchantOptions]);

  const submit = () => {
    const amountArs = parseAmountInput(amountInput);
    if (!amountArs) {
      Alert.alert('Monto inválido', 'Ingresá un monto positivo en pesos.');
      return;
    }

    const merchantName = merchantInput.trim();
    if (!merchantName) {
      Alert.alert('Comercio requerido', 'Elegí o escribí un comercio antes de continuar.');
      return;
    }

    try {
      if (pendingScan) {
        runPendingScanRecommendation(amountArs, allowOverride ? merchantName : undefined);
      } else {
        runManualRecommendation(merchantName, amountArs);
      }
      router.replace('/results');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo generar la recomendación.';
      Alert.alert('Error', message);
    }
  };

  return (
    <ScreenScroll>
      <PageTitle title="Monto y comercio" subtitle="Usá este paso para entradas manuales o para completar un QR sin monto." />

      {pendingScan ? (
        <InlineNotice
          title="QR ya interpretado"
          body={pendingScan.match.match_method === 'none'
            ? 'No hubo match confiable. Elegí el comercio manualmente para continuar.'
            : `Comercio detectado: ${pendingScan.match.merchant_name}. Podés usarlo o cambiarlo antes de calcular.`}
        />
      ) : null}

      <Card>
        <Text style={styles.label}>Monto en ARS</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={amountInput}
          onChangeText={setAmountInput}
          placeholder="30000"
          placeholderTextColor={colors.inkMuted}
        />
      </Card>

      <Card>
        <View style={styles.searchHeader}>
          <Text style={styles.label}>Comercio</Text>
          {pendingScan && !allowOverride ? (
            <SecondaryButton onPress={() => setAllowOverride(true)}>Cambiar comercio</SecondaryButton>
          ) : null}
        </View>
        <TextInput
          style={styles.input}
          value={merchantInput}
          onChangeText={setMerchantInput}
          editable={allowOverride || !pendingScan}
          placeholder="Ej. Jumbo, Farmacity, YPF"
          placeholderTextColor={colors.inkMuted}
        />

        <View style={styles.suggestions}>
          {suggestions.map(option => (
            <Pressable key={option.name} style={styles.suggestion} onPress={() => setMerchantInput(option.name)}>
              <Text style={styles.suggestionName}>{option.name}</Text>
              <Text style={styles.suggestionMeta}>{option.category} • {option.promoCount} promos</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <PrimaryButton onPress={submit}>Calcular mejores opciones</PrimaryButton>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fffdf8',
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestions: {
    gap: spacing.sm,
  },
  suggestion: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fffdf8',
    padding: spacing.md,
    gap: 4,
  },
  suggestionName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  suggestionMeta: {
    color: colors.inkMuted,
    fontSize: 12,
  },
});
