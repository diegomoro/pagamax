import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type PressableProps, type ScrollViewProps } from 'react-native';
import { colors, spacing } from '@/lib/theme';

export function ScreenScroll(props: ScrollViewProps) {
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[styles.screen, props.contentContainerStyle]}
      showsVerticalScrollIndicator={false}
    />
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleWrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Pill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'accent' | 'warning' | 'success' }) {
  return (
    <View style={[
      styles.pill,
      tone === 'accent' && styles.pillAccent,
      tone === 'warning' && styles.pillWarning,
      tone === 'success' && styles.pillSuccess,
    ]}>
      <Text style={[
        styles.pillLabel,
        tone === 'accent' && styles.pillLabelAccent,
        tone === 'warning' && styles.pillLabelWarning,
        tone === 'success' && styles.pillLabelSuccess,
      ]}>
        {label}
      </Text>
    </View>
  );
}

function BaseButton({ children, kind, ...props }: PressableProps & { children: ReactNode; kind: 'primary' | 'secondary' }) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && (kind === 'primary' ? styles.buttonPrimaryPressed : styles.buttonSecondaryPressed),
        typeof props.style === 'function' ? props.style({ pressed }) : props.style,
      ]}
    >
      <Text style={kind === 'primary' ? styles.buttonPrimaryLabel : styles.buttonSecondaryLabel}>{children}</Text>
    </Pressable>
  );
}

export function PrimaryButton(props: PressableProps & { children: ReactNode }) {
  return <BaseButton {...props} kind="primary" />;
}

export function SecondaryButton(props: PressableProps & { children: ReactNode }) {
  return <BaseButton {...props} kind="secondary" />;
}

export function InlineNotice({ title, body, tone = 'default' }: { title: string; body: string; tone?: 'default' | 'warning' }) {
  return (
    <View style={[styles.notice, tone === 'warning' && styles.noticeWarning]}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
    </View>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
    minHeight: '100%',
  },
  titleWrap: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkMuted,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.inkMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  button: {
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonPrimaryPressed: {
    backgroundColor: colors.accentPressed,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonSecondaryPressed: {
    backgroundColor: '#e5d6c2',
  },
  buttonPrimaryLabel: {
    color: '#fff7ef',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonSecondaryLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  pillAccent: {
    backgroundColor: '#fde2d8',
  },
  pillWarning: {
    backgroundColor: '#f7ead3',
  },
  pillSuccess: {
    backgroundColor: '#d8ecdf',
  },
  pillLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  pillLabelAccent: {
    color: colors.accentPressed,
  },
  pillLabelWarning: {
    color: colors.warning,
  },
  pillLabelSuccess: {
    color: colors.success,
  },
  notice: {
    borderRadius: 18,
    padding: spacing.md,
    backgroundColor: '#e8f0ea',
    gap: 4,
  },
  noticeWarning: {
    backgroundColor: '#f7ead3',
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  noticeBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingLabel: {
    color: colors.inkMuted,
    fontSize: 15,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
