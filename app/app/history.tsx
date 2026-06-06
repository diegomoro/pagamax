import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActivityItem } from '@/components/activity-item';
import { Chip, IconButton } from '@/components/ui';
import { SectionHeader } from '@/components/section-header';
import { SavingsSummaryCard } from '@/components/savings-summary-card';
import { usePagamax } from '@/context/pagamax-context';
import { DEMO_ACTIVITY } from '@/lib/demo-data';
import { summarizeActivity } from '@/lib/experience';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FilterKey = 'all' | 'month' | 'supermercados' | 'farmacia' | 'combustible';

export default function HistoryScreen() {
  const { activity } = usePagamax();
  const [filter, setFilter] = useState<FilterKey>('all');
  const insets = useSafeAreaInsets();
  const source = activity.length > 0 ? activity : DEMO_ACTIVITY;
  const summary = summarizeActivity(source);
  const bestCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of source) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.netSavingsArs);
    }
    return [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Compras';
  }, [source]);
  const progress = Math.min(1, summary.monthlyNetSavingsArs / 25000);
  const streakCount = Math.min(7, Math.max(1, source.length));

  const items = useMemo(() => {
    if (filter === 'all') return source;
    if (filter === 'month') {
      const month = new Date().getMonth();
      return source.filter((item) => new Date(item.createdAt).getMonth() === month);
    }
    return source.filter((item) => item.category.toLowerCase().includes(filter));
  }, [filter, source]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.topBar}>
              <IconButton icon="arrow-back" onPress={() => router.back()} />
              <Text style={styles.title}>Tu plata cuidada</Text>
              <View style={{ width: 44 }} />
            </View>

            <View style={styles.summaryRow}>
              <SavingsSummaryCard icon="calendar-outline" label="Mes" value={`$${summary.monthlyNetSavingsArs.toLocaleString('es-AR')}`} footnote="para vos" tone="teal" />
              <SavingsSummaryCard icon="wallet-outline" label="Acumulado" value={`$${summary.lifetimeNetSavingsArs.toLocaleString('es-AR')}`} footnote="guardado total" />
            </View>

            <View style={styles.progressCard}>
              <View style={styles.progressCopy}>
                <Text style={styles.progressTitle}>Como viene el mes</Text>
                <Text style={styles.progressBody}>{source.length} pagos mirados. Donde mas rindio: {bestCategory}.</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressHint}>Meta sana: ahorrar en compras que ya ibas a hacer.</Text>
            </View>

            <View style={styles.milestoneRow}>
              <View style={styles.milestone}>
                <Ionicons name="flame-outline" size={18} color={colors.warning} />
                <Text style={styles.milestoneValue}>{streakCount} dias</Text>
                <Text style={styles.milestoneLabel}>dias mirando antes de pagar</Text>
              </View>
              <View style={styles.milestone}>
                <Ionicons name="ribbon-outline" size={18} color={colors.accentPressed} />
                <Text style={styles.milestoneValue}>{bestCategory}</Text>
                <Text style={styles.milestoneLabel}>donde mas te convenia mirar</Text>
              </View>
            </View>

            <SectionHeader title="Actividad" subtitle="Mira donde te quedo mas plata." />
            <View style={styles.filters}>
              <Chip label="Todo" selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Este mes" selected={filter === 'month'} onPress={() => setFilter('month')} />
              <Chip label="Supermercados" selected={filter === 'supermercados'} onPress={() => setFilter('supermercados')} />
              <Chip label="Farmacia" selected={filter === 'farmacia'} onPress={() => setFilter('farmacia')} />
              <Chip label="Combustible" selected={filter === 'combustible'} onPress={() => setFilter('combustible')} />
            </View>
          </View>
        }
        renderItem={({ item }) => <ActivityItem item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
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
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerWrap: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.headingLg,
    color: colors.ink,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  progressCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressCopy: {
    gap: spacing.xxs,
  },
  progressTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  progressBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  progressHint: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  milestoneRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  milestone: {
    flex: 1,
    minWidth: 148,
    borderRadius: radius.lg,
    backgroundColor: colors.whiteSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
    gap: spacing.xs,
  },
  milestoneValue: {
    ...typography.headingSm,
    color: colors.ink,
  },
  milestoneLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
