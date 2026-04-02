import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SecondaryButton } from '@/components/ui';
import { colors, radius, shadows, spacing, typography } from '@/lib/theme';

export function CtaBar({
  title,
  primaryLabel,
  onPressPrimary,
  secondaryLabel,
  onPressSecondary,
}: {
  title: string;
  primaryLabel: string;
  onPressPrimary: () => void;
  secondaryLabel?: string;
  onPressSecondary?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <PrimaryButton onPress={onPressPrimary}>{primaryLabel}</PrimaryButton>
      {secondaryLabel && onPressSecondary ? (
        <SecondaryButton onPress={onPressSecondary}>{secondaryLabel}</SecondaryButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.md,
  },
  title: {
    ...typography.headingSm,
    color: colors.ink,
    textAlign: 'center',
  },
});
