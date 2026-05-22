import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { formatArs } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/lib/theme';
import type { SavingsActivity } from '@/types/app';

function formatDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

export function ActivityItem({
  item,
  onPress,
}: {
  item: SavingsActivity;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.merchant}>{item.merchantName}</Text>
          <Text style={styles.meta}>{formatDate(item.createdAt)} - {item.category} - {item.methodLabel}</Text>
        </View>
        <Text style={styles.netValue}>{formatArs(item.netSavingsArs)}</Text>
      </View>
      <View style={styles.breakdown}>
        <Text style={styles.breakdownText}>Ahorro bruto {formatArs(item.grossSavingsArs)}</Text>
        <Text style={styles.breakdownText}>Fee Paga Menos {formatArs(item.pagamaxFeeArs)}</Text>
      </View>
      <ConfidenceBadge confidence={item.confidence} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.987 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  merchant: {
    ...typography.headingSm,
    color: colors.ink,
  },
  meta: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  netValue: {
    ...typography.headingLg,
    color: colors.teal,
  },
  breakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  breakdownText: {
    ...typography.caption,
    color: colors.inkMuted,
  },
});
