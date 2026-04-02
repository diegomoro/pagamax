import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Card, Chip, IconButton, PageTitle, ScreenScroll, StickyButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { formatArs, parseAmountInput } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function ManualEntryScreen() {
  const params = useLocalSearchParams<{ merchant?: string; amount?: string }>();
  const { merchantOptions, pendingScan, runManualRecommendation, runPendingScanRecommendation } = usePagamax();
  const [amountInput, setAmountInput] = useState(params.amount ?? '');
  const [merchantInput, setMerchantInput] = useState(params.merchant ?? pendingScan?.match.merchant_name ?? '');
  const [allowOverride, setAllowOverride] = useState(!pendingScan || pendingScan.match.match_method === 'none');

  const suggestions = useMemo(() => {
    const query = merchantInput.trim().toLowerCase();
    const base = query
      ? merchantOptions.filter((option) => option.name.toLowerCase().includes(query))
      : merchantOptions;
    return base.slice(0, 5);
  }, [merchantInput, merchantOptions]);

  const amountArs = parseAmountInput(amountInput);
  const canSubmit = Boolean(amountArs && merchantInput.trim());

  const submit = async () => {
    if (!amountArs) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Monto invalido', 'Ingresa un monto positivo en pesos.');
      return;
    }

    const merchantName = merchantInput.trim();
    if (!merchantName) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Comercio requerido', 'Elige o escribe un comercio antes de continuar.');
      return;
    }

    try {
      if (pendingScan) {
        runPendingScanRecommendation(amountArs, allowOverride ? merchantName : undefined);
      } else {
        runManualRecommendation(merchantName, amountArs);
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.replace('/results');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo generar la recomendacion.';
      Alert.alert('Error', message);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-back" onPress={() => router.back()} />
        </View>
        <PageTitle title="Monto y comercio" subtitle="Completa el calculo si el QR no trae monto o si quieres buscar manualmente." />

        <Card elevated style={styles.formCard}>
          <View style={styles.amountWrap}>
            <Text style={styles.fieldLabel}>Monto</Text>
            <View style={styles.amountField}>
              <Text style={styles.amountPrefix}>$</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={amountInput}
                onChangeText={setAmountInput}
                placeholder="30.000"
                placeholderTextColor={colors.inkMuted}
              />
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Text style={styles.fieldLabel}>Comercio</Text>

            {pendingScan && !allowOverride ? (
              <View style={styles.chipRow}>
                <Chip label={pendingScan.match.merchant_name} selected />
                <Pressable onPress={() => setAllowOverride(true)}>
                  <Text style={styles.clearChip}>x cambiar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.searchField}>
                <Ionicons name="search-outline" size={18} color={colors.inkMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={merchantInput}
                  onChangeText={setMerchantInput}
                  editable={allowOverride || !pendingScan}
                  placeholder="Jumbo, Farmacity, YPF"
                  placeholderTextColor={colors.inkMuted}
                />
              </View>
            )}

            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.name}
              scrollEnabled={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={styles.suggestion} onPress={() => setMerchantInput(item.name)}>
                  <Text style={styles.suggestionName}>{item.name}</Text>
                  <Text style={styles.suggestionMeta}>{item.promoCount} promos</Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
            />
          </View>
        </Card>
      </ScreenScroll>

      <StickyButton
        label="Ver mejores opciones"
        preview={canSubmit ? `Calcular para ${merchantInput.trim()} por ${formatArs(amountArs ?? 0)}` : 'Completa monto y comercio para continuar'}
        disabled={!canSubmit}
        onPress={() => void submit()}
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
  },
  topBar: {
    marginTop: spacing.xs,
  },
  formCard: {
    gap: spacing.lg,
  },
  amountWrap: {
    gap: spacing.sm,
  },
  searchWrap: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.overline,
    color: colors.inkMuted,
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    minHeight: 72,
  },
  amountPrefix: {
    ...typography.displaySm,
    color: colors.accent,
  },
  amountInput: {
    flex: 1,
    ...typography.displaySm,
    color: colors.ink,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyLg,
    color: colors.ink,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clearChip: {
    ...typography.caption,
    color: colors.accentPressed,
  },
  suggestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  suggestionName: {
    ...typography.headingSm,
    color: colors.ink,
    flex: 1,
  },
  suggestionMeta: {
    ...typography.caption,
    color: colors.inkMuted,
  },
});
