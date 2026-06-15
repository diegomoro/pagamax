import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/lib/theme';

export function SavingsSummaryCard({
  icon,
  label,
  value,
  footnote,
  tone = 'default',
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  footnote: string;
  tone?: 'default' | 'teal' | 'accent';
}) {
  return (
    <Card style={[styles.card, tone === 'teal' ? styles.cardTeal : tone === 'accent' ? styles.cardAccent : undefined]}>
      <View style={styles.header}>
        <Ionicons name={icon} size={18} color={tone === 'accent' ? colors.accentPressed : tone === 'teal' ? colors.teal : colors.inkMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{value}</Text>
      <Text style={styles.footnote}>{footnote}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 156,
    gap: spacing.sm,
  },
  cardTeal: {
    backgroundColor: colors.tealSoft,
  },
  cardAccent: {
    backgroundColor: colors.accentSoft,
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
    ...typography.displaySm,
    color: colors.ink,
    flexShrink: 1,
  },
  footnote: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
});
