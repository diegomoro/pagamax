import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';

export interface RuleGridItem {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}

export function RuleGrid({ items }: { items: RuleGridItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.card}>
          <View style={styles.header}>
            <Ionicons name={item.icon} size={16} color={colors.inkMuted} />
            <Text style={styles.label}>{item.label}</Text>
          </View>
          <Text style={styles.value}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    width: '48%',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  value: {
    ...typography.headingSm,
    color: colors.ink,
  },
});
