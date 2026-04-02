import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';
import type { ConfidenceInfo } from '@/types/app';

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceInfo }) {
  return (
    <View style={[styles.wrap, confidence.label === 'Alta' ? styles.high : confidence.label === 'Media' ? styles.medium : styles.low]}>
      <Text style={styles.value}>Confianza {confidence.label}</Text>
      <Text style={styles.note}>{confidence.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
  high: {
    backgroundColor: colors.successSoft,
  },
  medium: {
    backgroundColor: colors.warningSoft,
  },
  low: {
    backgroundColor: colors.surfaceMuted,
  },
  value: {
    ...typography.caption,
    color: colors.ink,
  },
  note: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
});
