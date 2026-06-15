import * as Haptics from 'expo-haptics';
import { memo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StoredPaymentMethod } from '@/types/app';
import { ProviderIcon } from '@/components/provider-icon';
import { BottomSheet, Chip, EmptyState, IconButton, InlineNotice, LoadingBlock, Pill, ScreenScroll, SecondaryButton } from '@/components/ui';
import { FUNDING_DESTINATIONS_ENABLED } from '@/config/public-build';
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
  credit: 'crédito',
  debit: 'débito',
  prepaid: 'prepaga',
  account_money: 'saldo',
};

function isLiquidityWalletMethod(method: StoredPaymentMethod): boolean {
  return method.rail === 'qr'
    && method.canPayMerchantQr !== false
    && (method.cardType === undefined || method.cardType === 'account_money')
    && !(method.checkoutRails ?? []).includes('linked_card');
}

function describeMethodReadiness(method: StoredPaymentMethod): string {
  if (!isLiquidityWalletMethod(method)) return 'Solo referencia; no se usa para rutas con saldo';
  if (method.isDefault) return 'Principal con fondos para pagar rápido';
  if (method.manualFundingRequired) {
    return FUNDING_DESTINATIONS_ENABLED && method.identityVerificationStatus === 'same_owner_verified'
      ? 'Identidad verificada para fondeo'
      : 'No disponible para el build público';
  }
  if (!method.checkoutRails || method.checkoutRails.length === 0 || method.checkoutRails.every((rail) => rail === 'unsupported')) {
    return 'Marcala como principal si tiene fondos';
  }
  return 'Listo para pagar con QR';
}

const MethodRow = memo(function MethodRow({
  expanded,
  method,
  onExpand,
  onLabelChange,
  onToggle,
  onSelectBrand,
  onSelectType,
  onSetMain,
}: {
  expanded: boolean;
  method: StoredPaymentMethod;
  onExpand: () => void;
  onLabelChange: (value: string) => void;
  onToggle: () => void;
  onSelectBrand: (value?: string) => void;
  onSelectType: (value?: StoredPaymentMethod['cardType']) => void;
  onSetMain: () => void;
}) {
  const canUseInLiquidity = isLiquidityWalletMethod(method);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${method.label}. ${describeMethodReadiness(method)}`}
      onPress={onExpand}
      style={({ pressed }) => [styles.rowCard, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <ProviderIcon provider={method.provider} />
        <View style={styles.copy}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{method.label}</Text>
            {method.isDefault ? <Pill label="principal" tone="success" /> : null}
          </View>
          <Text style={styles.meta}>{describeMethodReadiness(method)}</Text>
        </View>
        <Switch
          accessibilityLabel={`${method.enabled ? 'Desactivar' : 'Activar'} ${method.label}`}
          disabled={!canUseInLiquidity}
          value={canUseInLiquidity ? method.enabled : false}
          onValueChange={onToggle}
        />
      </View>

      {expanded ? (
        <View style={styles.accordion}>
          <InlineNotice
            title={!canUseInLiquidity ? 'Fuera de liquidez' : method.isDefault ? 'Esta es tu plata disponible' : 'Usarla como billetera principal'}
            body={!canUseInLiquidity
              ? 'Paga Menos no usa tarjetas, cuotas ni linked-card como ruta ejecutable. Solo saldo en cuenta o billetera.'
              : method.isDefault
                ? 'La usamos primero cuando no hay una promo clara y para evitar rutas que pidan transferir plata en la fila.'
                : 'Marcala solo si normalmente tiene saldo disponible para pagar en pocos toques.'}
            tone={!canUseInLiquidity ? 'default' : method.isDefault ? 'default' : 'warning'}
          />

          {canUseInLiquidity && !method.isDefault ? (
            <SecondaryButton onPress={onSetMain}>Usar como principal</SecondaryButton>
          ) : null}

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
  const { fundingDestinations, loading, methods, resetMethods, setMainFundingMethod, toggleMethodEnabled, updateMethod } = usePagamax();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();

  if (loading) {
    return <LoadingBlock label="Cargando medios guardados..." />;
  }

  const sortedMethods = [...methods].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    const leftEligible = isLiquidityWalletMethod(left) ? 1 : 0;
    const rightEligible = isLiquidityWalletMethod(right) ? 1 : 0;
    if (leftEligible !== rightEligible) return rightEligible - leftEligible;
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    return left.label.localeCompare(right.label);
  });
  const activeCount = methods.filter((method) => method.enabled && isLiquidityWalletMethod(method)).length;
  const mainMethod = methods.find((method) => method.isDefault);

  const handleToggle = (id: string) => {
    triggerHaptic(Haptics.selectionAsync());
    toggleMethodEnabled(id);
  };

  if (methods.length === 0) {
    return (
      <ScreenScroll>
        <EmptyState title="Todavía no hay medios cargados" body="Restaurá las plantillas para empezar a comparar." action={<SecondaryButton onPress={() => void resetMethods()}>Restaurar</SecondaryButton>} />
      </ScreenScroll>
    );
  }

  return (
    <>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Tus medios de pago</Text>
            <Text style={styles.subtitle}>
              {activeCount} activos de {methods.length}
              {FUNDING_DESTINATIONS_ENABLED ? ` - ${fundingDestinations.length} cuentas propias` : ''}
            </Text>
            <Text style={styles.subtitle}>
              Principal: {mainMethod?.label ?? 'elegí una billetera con fondos'}
            </Text>
          </View>
          <IconButton icon="ellipsis-horizontal" onPress={() => setMenuOpen(true)} />
        </View>

        <FlatList
          data={sortedMethods}
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
              onSetMain={() => setMainFundingMethod(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          showsVerticalScrollIndicator={false}
        />
      </View>

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Acciones">
        {FUNDING_DESTINATIONS_ENABLED ? (
          <SecondaryButton
            onPress={() => {
              setMenuOpen(false);
              router.push('/funding-destination');
            }}
          >
            Agregar cuenta propia
          </SecondaryButton>
        ) : null}
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
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.headingSm,
    color: colors.ink,
    flexShrink: 1,
  },
  meta: {
    ...typography.caption,
    color: colors.inkMuted,
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
