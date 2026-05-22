import * as Haptics from 'expo-haptics';
import { memo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { StoredPaymentMethod } from '@/types/app';
import { ProviderIcon } from '@/components/provider-icon';
import { BottomSheet, Chip, EmptyState, IconButton, LoadingBlock, ScreenScroll, SecondaryButton } from '@/components/ui';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

function triggerHaptic(effect: Promise<void>): void {
  void effect.catch(() => {
    // Switch state should not wait on optional native feedback.
  });
}

const BRAND_OPTIONS = ['Visa', 'Mastercard', 'Amex', 'Cabal'];
const TYPE_OPTIONS: Array<NonNullable<StoredPaymentMethod['cardType']>> = ['credit', 'debit', 'prepaid', 'account_money'];
const TYPE_LABELS: Record<NonNullable<StoredPaymentMethod['cardType']>, string> = {
  credit: 'credito',
  debit: 'debito',
  prepaid: 'prepaga',
  account_money: 'saldo',
};

const MethodRow = memo(function MethodRow({
  expanded,
  method,
  onExpand,
  onLabelChange,
  onToggle,
  onSelectBrand,
  onSelectType,
}: {
  expanded: boolean;
  method: StoredPaymentMethod;
  onExpand: () => void;
  onLabelChange: (value: string) => void;
  onToggle: () => void;
  onSelectBrand: (value?: string) => void;
  onSelectType: (value?: StoredPaymentMethod['cardType']) => void;
}) {
  return (
    <Pressable onPress={onExpand} style={({ pressed }) => [styles.rowCard, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <ProviderIcon provider={method.provider} />
        <View style={styles.copy}>
          <Text style={styles.label}>{method.label}</Text>
          <Text style={styles.meta}>{method.provider} - {method.rail}</Text>
        </View>
        <Switch value={method.enabled} onValueChange={onToggle} />
      </View>

      {expanded ? (
        <View style={styles.accordion}>
          <TextInput
            style={styles.input}
            value={method.label}
            onChangeText={onLabelChange}
            placeholder="Etiqueta visible"
            placeholderTextColor={colors.inkMuted}
          />

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Marca</Text>
            <View style={styles.chips}>
              {BRAND_OPTIONS.map((option) => (
                <Chip key={option} label={option} selected={method.cardBrand === option} onPress={() => onSelectBrand(option)} />
              ))}
              <Chip label="Sin marca" selected={!method.cardBrand} onPress={() => onSelectBrand(undefined)} />
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Tipo</Text>
            <View style={styles.chips}>
              {TYPE_OPTIONS.map((option) => (
                <Chip key={option} label={TYPE_LABELS[option]} selected={method.cardType === option} onPress={() => onSelectType(option)} />
              ))}
              <Chip label="Sin tipo" selected={!method.cardType} onPress={() => onSelectType(undefined)} />
            </View>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
});

export default function MethodsScreen() {
  const { loading, methods, resetMethods, toggleMethodEnabled, updateMethod } = usePagamax();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return <LoadingBlock label="Cargando medios guardados..." />;
  }

  const activeCount = methods.filter((method) => method.enabled).length;

  const handleToggle = (id: string) => {
    triggerHaptic(Haptics.selectionAsync());
    toggleMethodEnabled(id);
  };

  if (methods.length === 0) {
    return (
      <ScreenScroll>
        <EmptyState title="Todavia no hay medios cargados" body="Restaura las plantillas demo para empezar a comparar." action={<SecondaryButton onPress={() => void resetMethods()}>Restaurar</SecondaryButton>} />
      </ScreenScroll>
    );
  }

  return (
    <>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Tus medios de pago</Text>
            <Text style={styles.subtitle}>{activeCount} activos de {methods.length}</Text>
          </View>
          <IconButton icon="ellipsis-horizontal" onPress={() => setMenuOpen(true)} />
        </View>

        <FlatList
          data={methods}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MethodRow
              expanded={expandedId === item.id}
              method={item}
              onExpand={() => setExpandedId((prev) => prev === item.id ? null : item.id)}
              onLabelChange={(value) => updateMethod(item.id, { label: value })}
              onToggle={() => void handleToggle(item.id)}
              onSelectBrand={(value) => updateMethod(item.id, { cardBrand: value })}
              onSelectType={(value) => updateMethod(item.id, { cardType: value })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Acciones">
        <SecondaryButton onPress={() => void resetMethods()}>Restaurar plantillas demo</SecondaryButton>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerCopy: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.displaySm,
    color: colors.ink,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  list: {
    paddingBottom: 132,
  },
  rowCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowPressed: {
    transform: [{ scale: 0.988 }],
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  label: {
    ...typography.headingSm,
    color: colors.ink,
  },
  meta: {
    ...typography.caption,
    color: colors.inkMuted,
    textTransform: 'capitalize',
  },
  accordion: {
    gap: spacing.md,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceSoft,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodyLg,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
