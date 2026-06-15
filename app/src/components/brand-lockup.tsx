import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/lib/theme';

const BRAND_ICON = require('../../assets/icon.png');

export function BrandLockup({
  compact = false,
  showTagline = true,
  showHolding = false,
}: {
  compact?: boolean;
  showTagline?: boolean;
  showHolding?: boolean;
}) {
  const iconSize = compact ? 36 : 48;

  return (
    <View style={styles.row}>
      <Image source={BRAND_ICON} style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.24 }} />
      <View style={styles.copy}>
        <Text style={[styles.name, compact && styles.nameCompact]}>Paga Menos</Text>
        {showTagline ? <Text style={styles.tagline}>Escaneás. Ahorrás. Listo.</Text> : null}
        {showHolding ? <Text style={styles.holding}>Independiente de bancos y billeteras</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  copy: {
    gap: spacing.xxs,
  },
  name: {
    ...typography.displaySm,
    color: colors.ink,
  },
  nameCompact: {
    ...typography.headingLg,
  },
  tagline: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  holding: {
    ...typography.caption,
    color: colors.inkMuted,
  },
});
