import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/lib/theme';

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onPressAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onPressAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onPressAction ? (
        <Pressable onPress={onPressAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.headingLg,
    color: colors.ink,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  action: {
    ...typography.caption,
    color: colors.accentPressed,
  },
});
