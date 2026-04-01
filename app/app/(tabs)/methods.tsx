import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Card, LoadingBlock, PageTitle, Pill, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, spacing } from '@/lib/theme';

const BRAND_OPTIONS = ['Visa', 'Mastercard', 'Amex', 'Cabal', ''];
const TYPE_OPTIONS = ['credit', 'debit', 'prepaid', 'account_money', ''];

export default function MethodsScreen() {
  const { loading, methods, resetMethods, toggleMethodEnabled, updateMethod } = usePagamax();

  if (loading) {
    return <LoadingBlock label="Cargando métodos guardados..." />;
  }

  return (
    <ScreenScroll>
      <PageTitle title="Tus métodos" subtitle="Editá solo lo necesario para que el ranking sea útil en tu teléfono." />
      <SecondaryButton onPress={() => void resetMethods()}>Restaurar plantillas demo</SecondaryButton>

      {methods.map(method => (
        <Card key={method.id}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.title}>{method.provider}</Text>
              <Text style={styles.caption}>ID: {method.id}</Text>
            </View>
            <Switch value={method.enabled} onValueChange={() => toggleMethodEnabled(method.id)} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Etiqueta visible</Text>
            <TextInput
              style={styles.input}
              value={method.label}
              onChangeText={(value) => updateMethod(method.id, { label: value })}
              placeholder="Ej. MODO + Santander Visa crédito"
              placeholderTextColor={colors.inkMuted}
            />
          </View>

          <View style={styles.row}>
            <Pill label={`Rail: ${method.rail}`} />
            <Pill label={method.enabled ? 'Activo' : 'Desactivado'} tone={method.enabled ? 'success' : 'warning'} />
          </View>

          <View style={styles.optionGroup}>
            <Text style={styles.label}>Marca</Text>
            <View style={styles.optionRow}>
              {BRAND_OPTIONS.map(option => (
                <SecondaryButton
                  key={option || 'none'}
                  onPress={() => updateMethod(method.id, { cardBrand: option || undefined })}
                >
                  {option || 'Sin marca'}
                </SecondaryButton>
              ))}
            </View>
          </View>

          <View style={styles.optionGroup}>
            <Text style={styles.label}>Tipo</Text>
            <View style={styles.optionRow}>
              {TYPE_OPTIONS.map(option => (
                <SecondaryButton
                  key={option || 'none'}
                  onPress={() => updateMethod(method.id, { cardType: option ? option as typeof method.cardType : undefined })}
                >
                  {option || 'Sin tipo'}
                </SecondaryButton>
              ))}
            </View>
          </View>
        </Card>
      ))}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  caption: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fffdf8',
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionGroup: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
