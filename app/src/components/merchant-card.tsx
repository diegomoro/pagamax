import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ConfidenceBadge } from '@/components/confidence-badge';
import { ProviderIcon } from '@/components/provider-icon';
import { Pill } from '@/components/ui';
import { formatArs } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/lib/theme';
import type { MerchantOpportunity } from '@/types/app';

export function MerchantCard({
  merchant,
  onPress,
}: {
  merchant: MerchantOpportunity;
  onPress?: () => void;
}) {
  const isSponsored = merchant.placement === 'sponsored';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, isSponsored && styles.sponsoredCard, pressed && styles.pressed]}>
      <View style={styles.placementRow}>
        <View style={[styles.placementIcon, isSponsored && styles.placementIconSponsored]}>
          <Ionicons name={isSponsored ? 'megaphone-outline' : 'sparkles-outline'} size={15} color={isSponsored ? colors.warning : colors.accentPressed} />
        </View>
        <View style={styles.placementCopy}>
          <Text style={styles.placementLabel}>{merchant.placementLabel ?? (isSponsored ? 'Pagado, marcado' : 'Buen lugar para mirar')}</Text>
          {merchant.placementReason ? <Text style={styles.placementReason}>{merchant.placementReason}</Text> : null}
        </View>
      </View>

      <View style={styles.header}>
        <View style={styles.left}>
          <ProviderIcon provider={merchant.providerHint?.toLowerCase().replace(/\s+/g, '') || merchant.category.toLowerCase()} />
          <View style={styles.copy}>
            <Text style={styles.title}>{merchant.merchantName}</Text>
            <Text style={styles.meta}>
              {merchant.category}
              {merchant.distanceLabel ? ` - ${merchant.distanceLabel}` : ''}
            </Text>
          </View>
        </View>
        <Pill label={merchant.providerHint ? `Proba ${merchant.providerHint}` : 'Puede rendir'} tone={isSponsored ? 'warning' : 'accent'} />
      </View>

      <View style={styles.values}>
        <Text style={styles.netValue}>{formatArs(merchant.likelyNetSavingsArs)}</Text>
        <Text style={styles.valueCaption}>Plata estimada para vos</Text>
      </View>

      <Text style={styles.reason}>{merchant.reason}</Text>
      <ConfidenceBadge confidence={merchant.confidence} />

      <View style={styles.tags}>
        {merchant.tags.map((tag) => (
          <Pill key={tag} label={tag} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sponsoredCard: {
    backgroundColor: colors.whiteSoft,
    borderColor: colors.warningSoft,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  placementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.sm,
  },
  placementIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  placementIconSponsored: {
    backgroundColor: colors.warningSoft,
  },
  placementCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  placementLabel: {
    ...typography.caption,
    color: colors.ink,
  },
  placementReason: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.headingSm,
    color: colors.ink,
  },
  meta: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  values: {
    gap: spacing.xxs,
  },
  netValue: {
    ...typography.displaySm,
    color: colors.teal,
  },
  valueCaption: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  reason: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
