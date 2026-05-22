import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { ActivityItem } from '@/components/activity-item';
import { Chip, IconButton } from '@/components/ui';
import { SectionHeader } from '@/components/section-header';
import { SavingsSummaryCard } from '@/components/savings-summary-card';
import { usePagamax } from '@/context/pagamax-context';
import { DEMO_ACTIVITY } from '@/lib/demo-data';
import { summarizeActivity } from '@/lib/experience';
import { colors, spacing, typography } from '@/lib/theme';
import { router } from 'expo-router';

type FilterKey = 'all' | 'month' | 'supermercados' | 'farmacia' | 'combustible';

export default function HistoryScreen() {
  const { activity } = usePagamax();
  const [filter, setFilter] = useState<FilterKey>('all');
  const source = activity.length > 0 ? activity : DEMO_ACTIVITY;
  const summary = summarizeActivity(source);

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
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.topBar}>
              <IconButton icon="arrow-back" onPress={() => router.back()} />
              <Text style={styles.title}>Historial de ahorro</Text>
              <View style={{ width: 44 }} />
            </View>

            <View style={styles.summaryRow}>
              <SavingsSummaryCard icon="calendar-outline" label="Mes" value={`$${summary.monthlyNetSavingsArs.toLocaleString('es-AR')}`} footnote="neto para vos" tone="teal" />
              <SavingsSummaryCard icon="wallet-outline" label="Acumulado" value={`$${summary.lifetimeNetSavingsArs.toLocaleString('es-AR')}`} footnote="neto historico" />
            </View>

            <SectionHeader title="Actividad" subtitle="Filtra por periodo o categoria para revisar donde ahorraste mas." />
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
    gap: spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
