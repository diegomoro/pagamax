import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type SwitchProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, timing, typography } from '@/lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function triggerHaptic(effect: Promise<void>): void {
  void effect.catch(() => {
    // Haptics are optional; control actions must never wait on them.
  });
}

export function ScreenScroll(props: ScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      {...props}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.md }, props.contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleWrap}>
      <Text style={styles.pageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Card({
  children,
  elevated = false,
  style,
}: {
  children: ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, elevated && styles.cardElevated, style]}>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Pill({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'accent' | 'warning' | 'success';
}) {
  return (
    <View style={[styles.pill, toneStyles[tone].pill]}>
      <Text style={[styles.pillLabel, toneStyles[tone].label]}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const handlePress = () => {
    triggerHaptic(Haptics.selectionAsync());
    onPress?.();
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.chipPressed]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function InlineNotice({
  title,
  body,
  tone = 'default',
}: {
  title: string;
  body: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <View style={[styles.notice, tone === 'warning' && styles.noticeWarning]}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
    </View>
  );
}

function BaseButton({
  children,
  kind,
  stretch = true,
  onPress,
  style,
  ...props
}: PressableProps & { children: ReactNode; kind: 'primary' | 'secondary'; stretch?: boolean }) {
  const handlePress = (event: GestureResponderEvent) => {
    triggerHaptic(Haptics.impactAsync(kind === 'primary' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light));
    onPress?.(event);
  };

  return (
    <Pressable
      {...props}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
        !stretch && styles.buttonAuto,
        pressed && styles.buttonPressed,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      {kind === 'primary' ? (
        <LinearGradient colors={[colors.accent, colors.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.buttonPrimaryFill}>
          <Text style={styles.buttonPrimaryLabel}>{children}</Text>
        </LinearGradient>
      ) : (
        <Text style={styles.buttonSecondaryLabel}>{children}</Text>
      )}
    </Pressable>
  );
}

export function PrimaryButton(props: PressableProps & { children: ReactNode; stretch?: boolean }) {
  return <BaseButton {...props} kind="primary" />;
}

export function SecondaryButton(props: PressableProps & { children: ReactNode; stretch?: boolean }) {
  return <BaseButton {...props} kind="secondary" />;
}

export function IconButton({
  icon,
  onPress,
  tone = 'surface',
  size = 22,
}: {
  icon: IoniconName;
  onPress?: () => void;
  tone?: 'surface' | 'ghost' | 'light';
  size?: number;
}) {
  const handlePress = () => {
    triggerHaptic(Haptics.selectionAsync());
    onPress?.();
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.iconButton, tone === 'ghost' && styles.iconButtonGhost, tone === 'light' && styles.iconButtonLight, pressed && styles.iconButtonPressed]}>
      <Ionicons
        name={icon}
        size={size}
        color={tone === 'light' ? colors.white : colors.ink}
      />
    </Pressable>
  );
}

export function FloatingActionButton({ onPress }: { onPress?: () => void }) {
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    triggerHaptic(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    onPress?.();
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 18 }, pressed && styles.buttonPressed]}>
      <Ionicons name="qr-code-outline" size={28} color={colors.whiteSoft} />
    </Pressable>
  );
}

export function ToggleRow({
  title,
  body,
  value,
  onValueChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onValueChange: SwitchProps['onValueChange'];
}) {
  const handleValueChange: SwitchProps['onValueChange'] = (next) => {
    triggerHaptic(Haptics.selectionAsync());
    onValueChange?.(next);
  };

  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleBody}>{body}</Text>
      </View>
      <Switch value={value} onValueChange={handleValueChange} />
    </View>
  );
}

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radiusValue = radius.md,
}: {
  width?: number | `${number}%`;
  height?: number;
  radiusValue?: number;
}) {
  const translateX = useRef(new Animated.Value(-160)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: 220,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [translateX]);

  return (
    <View style={[styles.skeletonBase, { width, height, borderRadius: radiusValue }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.skeletonShimmer}
        />
      </Animated.View>
    </View>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingLabel}>{label}</Text>
        <SkeletonBlock height={22} />
        <SkeletonBlock width="72%" />
        <SkeletonBlock width="56%" />
      </View>
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </Card>
  );
}

export function StickyButton({
  label,
  preview,
  disabled,
  onPress,
}: {
  label: string;
  preview?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={styles.stickyWrap}>
      <LinearGradient
        colors={['rgba(243,236,226,0)', colors.background]}
        style={[styles.stickyGradient, { paddingBottom: insets.bottom + spacing.sm }]}
      >
        <View style={styles.stickyInner}>
          {preview ? <Text style={styles.stickyPreview}>{preview}</Text> : null}
          <PrimaryButton onPress={onPress} disabled={disabled} style={disabled ? styles.buttonDisabled : undefined}>
            {label}
          </PrimaryButton>
        </View>
      </LinearGradient>
    </View>
  );
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const translateY = useRef(new Animated.Value(420)).current;

  useEffect(() => {
    if (!visible) {
      translateY.setValue(420);
      return;
    }
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: timing.spring.damping,
      stiffness: timing.spring.stiffness,
      mass: 0.8,
    }).start();
  }, [translateY, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 120) {
          onClose();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: timing.spring.damping,
          stiffness: timing.spring.stiffness,
          mass: 0.8,
        }).start();
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={styles.sheetHandle} />
        {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
        <View style={styles.sheetContent}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const toneStyles: Record<'default' | 'accent' | 'warning' | 'success', { pill: ViewStyle; label: TextStyle }> = {
  default: {
    pill: { backgroundColor: colors.surfaceMuted },
    label: { color: colors.inkMuted },
  },
  accent: {
    pill: { backgroundColor: colors.accentSoft },
    label: { color: colors.accentPressed },
  },
  warning: {
    pill: { backgroundColor: colors.warningSoft },
    label: { color: colors.warning },
  },
  success: {
    pill: { backgroundColor: colors.successSoft },
    label: { color: colors.success },
  },
};

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.background,
    minHeight: '100%',
  },
  titleWrap: {
    gap: spacing.xs,
  },
  pageTitle: {
    ...typography.displaySm,
    color: colors.ink,
  },
  pageSubtitle: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  sectionTitle: {
    ...typography.overline,
    color: colors.inkMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardElevated: {
    backgroundColor: colors.surfaceElevated,
    ...shadows.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    width: '100%',
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillLabel: {
    ...typography.caption,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipPressed: {
    transform: [{ scale: 0.97 }],
  },
  chipLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  chipLabelSelected: {
    color: colors.accentPressed,
  },
  statPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: spacing.xxs,
  },
  statValue: {
    ...typography.headingSm,
    color: colors.ink,
  },
  statLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.tealSoft,
    gap: spacing.xxs,
  },
  noticeWarning: {
    backgroundColor: colors.warningSoft,
  },
  noticeTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  noticeBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  button: {
    borderRadius: radius.md,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    transform: [{ scale: 1 }],
  },
  buttonAuto: {
    alignSelf: 'flex-start',
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
  },
  buttonPrimary: {
    overflow: 'hidden',
    ...shadows.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPrimaryFill: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPrimaryLabel: {
    ...typography.headingSm,
    color: colors.whiteSoft,
  },
  buttonSecondaryLabel: {
    ...typography.headingSm,
    color: colors.ink,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    ...shadows.sm,
  },
  iconButtonGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  iconButtonLight: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.24)',
  },
  iconButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.background,
    ...shadows.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  toggleTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  toggleBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  skeletonBase: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  skeletonShimmer: {
    width: 120,
    height: '100%',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  loadingLabel: {
    ...typography.bodyLg,
    color: colors.inkMuted,
  },
  emptyState: {
    alignItems: 'flex-start',
  },
  emptyTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  emptyBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  stickyWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  stickyGradient: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
  },
  stickyInner: {
    gap: spacing.xs,
  },
  stickyPreview: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    ...shadows.lg,
  },
  sheetHandle: {
    width: 52,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.divider,
    alignSelf: 'center',
  },
  sheetTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  sheetContent: {
    gap: spacing.md,
  },
});
