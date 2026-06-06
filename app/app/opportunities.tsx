import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';
import { MerchantCard } from '@/components/merchant-card';
import { SectionHeader } from '@/components/section-header';
import { usePagamax } from '@/context/pagamax-context';
import { DEMO_OPPORTUNITIES } from '@/lib/demo-data';
import { formatArs } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/lib/theme';

export default function OpportunitiesScreen() {
  const { settings } = usePagamax();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return DEMO_OPPORTUNITIES.filter((item) => {
      const matchesQuery = !normalized || item.merchantName.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized);
      const matchesSurface = settings.surfacePreferences.travel || item.category !== 'Viajes';
      return matchesQuery && matchesSurface;
    });
  }, [query, settings.surfacePreferences.travel]);
  const bestOffer = items.find((item) => item.placement !== 'sponsored') ?? items[0];
  const sponsoredOffer = items.find((item) => item.placement === 'sponsored');

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
              <Text style={styles.title}>Donde puede rendir</Text>
              <View style={styles.placeholder} />
            </View>

            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="storefront-outline" size={24} color={colors.accentPressed} />
              </View>
              <Text style={styles.heroTitle}>Promos cerca tuyo</Text>
              <Text style={styles.heroBody}>Aca gana el ahorro probable. Si un comercio paga por aparecer, queda marcado y separado.</Text>
              <View style={styles.proofRow}>
                <View style={styles.proofPill}>
                  <Text style={styles.proofValue}>1</Text>
                  <Text style={styles.proofLabel}>ahorro primero</Text>
                </View>
                <View style={styles.proofPill}>
                  <Text style={styles.proofValue}>2</Text>
                  <Text style={styles.proofLabel}>pagado marcado</Text>
                </View>
                <View style={styles.proofPill}>
                  <Text style={styles.proofValue}>3</Text>
                  <Text style={styles.proofLabel}>vos elegis</Text>
                </View>
              </View>
            </View>

            {bestOffer ? (
              <View style={styles.dealStrip}>
                <View style={styles.dealCopy}>
                  <Text style={styles.dealLabel}>Aca puede haber plata para vos</Text>
                  <Text style={styles.dealTitle}>{bestOffer.merchantName}</Text>
                </View>
                <Text style={styles.dealValue}>{formatArs(bestOffer.likelyNetSavingsArs)}</Text>
              </View>
            ) : null}

            {sponsoredOffer ? (
              <View style={styles.sponsoredNote}>
                <Ionicons name="megaphone-outline" size={16} color={colors.warning} />
                <Text style={styles.sponsoredText}>
                  Pagado: {sponsoredOffer.merchantName}. No reemplaza al mejor ahorro y muestra el beneficio estimado.
                </Text>
              </View>
            ) : null}

            <SectionHeader title="Ideas cerca tuyo" subtitle="Buenos lugares para revisar antes de pagar." />
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar comercio o rubro"
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
    gap: spacing.sm,
  },
  placeholder: {
    width: 44,
  },
  title: {
    ...typography.headingLg,
    color: colors.ink,
    flex: 1,
    textAlign: 'center',
  },
  hero: {
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  heroTitle: {
    ...typography.displaySm,
    color: colors.ink,
  },
  heroBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  proofRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  proofPill: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  proofValue: {
    ...typography.headingSm,
    color: colors.teal,
  },
  proofLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  dealStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.tealSoft,
    padding: spacing.md,
  },
  dealCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  dealLabel: {
    ...typography.caption,
    color: colors.teal,
  },
  dealTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  dealValue: {
    ...typography.headingLg,
    color: colors.teal,
    textAlign: 'right',
  },
  sponsoredNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  sponsoredText: {
    ...typography.bodySm,
    color: colors.warning,
    flex: 1,
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
