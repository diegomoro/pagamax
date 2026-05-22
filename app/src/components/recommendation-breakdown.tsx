import { StyleSheet, Text, View } from 'react-native';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { Card } from '@/components/ui';
import { formatArs } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/lib/theme';
import type { ConfidenceInfo } from '@/types/app';

export function RecommendationBreakdown({
  grossSavingsArs,
  pagamaxFeeArs,
  netSavingsArs,
  confidence,
  hideFee = false,
}: {
  grossSavingsArs: number;
  pagamaxFeeArs: number;
  netSavingsArs: number;
  confidence: ConfidenceInfo;
  hideFee?: boolean;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.grid}>
        <Metric label="Ahorro bruto" value={formatArs(grossSavingsArs)} />
        {!hideFee ? <Metric label="Fee" value={formatArs(pagamaxFeeArs)} /> : null}
        <Metric label="Te queda" value={formatArs(netSavingsArs)} highlight />
      </View>
      <ConfidenceBadge confidence={confidence} />
    </Card>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metric, highlight && styles.metricHighlight]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, highlight && styles.metricValueHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  metricHighlight: {
    backgroundColor: colors.tealSoft,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  metricValue: {
    ...typography.headingSm,
    color: colors.ink,
  },
  metricValueHighlight: {
    color: colors.teal,
  },
});
