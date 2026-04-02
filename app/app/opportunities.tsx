import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { IconButton } from '@/components/ui';
import { MerchantCard } from '@/components/merchant-card';
import { SectionHeader } from '@/components/section-header';
import { usePagamax } from '@/context/pagamax-context';
import { DEMO_OPPORTUNITIES } from '@/lib/demo-data';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { router } from 'expo-router';

export default function OpportunitiesScreen() {
  const { settings } = usePagamax();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return DEMO_OPPORTUNITIES.filter((item) => {
      const matchesQuery = !normalized || item.merchantName.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized);
      const matchesSurface = settings.surfacePreferences.travel || item.category !== 'Travel';
      return matchesQuery && matchesSurface;
    });
  }, [query, settings.surfacePreferences.travel]);

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
              <Text style={styles.title}>Merchant opportunities</Text>
              <View style={{ width: 44 }} />
            </View>
            <SectionHeader title="Nearby and high-fit merchants" subtitle="Explora donde Pagamax suele rendir con tus medios actuales." />
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar comercio o categoria"
                placeholderTextColor={colors.inkMuted}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <MerchantCard merchant={item} onPress={() => router.push({ pathname: '/manual', params: { merchant: item.merchantName } })} />
        )}
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
  searchWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  searchInput: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    ...typography.bodyLg,
  },
});
