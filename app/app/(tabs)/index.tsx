import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_ACTIVITY, DEMO_OPPORTUNITIES, DEMO_REPEAT_MERCHANTS } from '@/lib/demo-data';
import { BottomSheet, IconButton, InlineNotice, LoadingBlock, SecondaryButton, ToggleRow } from '@/components/ui';
import { BrandLockup } from '@/components/brand-lockup';
import { usePagamax } from '@/context/pagamax-context';
import { formatArs } from '@/lib/format';
import { summarizeActivity } from '@/lib/experience';
import { colors, radius, shadows, spacing, typography } from '@/lib/theme';

export default function HomeScreen() {
  const {
    activity,
    currentSession,
    error,
    loading,
    promoIndex,
    settings,
    updateSettings,
  } = usePagamax();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const scanPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading && !settings.onboardingCompleted) {
      router.replace('/onboarding');
    }
  }, [loading, settings.onboardingCompleted]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scanPulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      { iterations: 4 },
    );
    loop.start();
    return () => loop.stop();
  }, [scanPulse]);

  const quickMerchantNames = useMemo(() => (
    Array.from(new Set([
      ...settings.savedMerchants,
      ...activity.slice(0, 3).map((item) => item.merchantName),
      ...DEMO_ACTIVITY.slice(0, 2).map((item) => item.merchantName),
      ...DEMO_REPEAT_MERCHANTS,
    ])).slice(0, 3)
  ), [activity, settings.savedMerchants]);
  const hasRealActivity = activity.length > 0;
  const summary = useMemo(() => summarizeActivity(activity), [activity]);
  const displaySummary = useMemo(() => summarizeActivity(hasRealActivity ? activity : DEMO_ACTIVITY), [activity, hasRealActivity]);
  const checksThisMonth = useMemo(() => {
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    return activity.filter((item) => {
      const date = new Date(item.createdAt);
      return date.getMonth() === month && date.getFullYear() === year;
    }).length;
  }, [activity]);
  const monthlyGoalArs = 25000;
  const goalProgress = Math.min(1, displaySummary.monthlyNetSavingsArs / monthlyGoalArs);
  const smartStreak = hasRealActivity ? Math.min(7, Math.max(1, checksThisMonth)) : 3;
  const bestNearbyPromo = DEMO_OPPORTUNITIES.find((item) => item.placement !== 'sponsored') ?? DEMO_OPPORTUNITIES[0];
  const merchantSpotlight = DEMO_OPPORTUNITIES.find((item) => item.placement === 'sponsored');

  const sharePagamax = async () => {
    try {
      await Share.share({
        message: 'Antes de pagar escaneo con Paga Menos. Me dice qué app o tarjeta conviene y después confirmo yo.',
      });
    } catch {
      // Sharing is optional; the home screen should stay quiet if the sheet fails.
    }
  };
  const scanLift = scanPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  const haloOpacity = scanPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.38],
  });
  const haloScale = scanPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.04],
  });

  if (loading) {
    return <LoadingBlock label="Cargando Paga Menos..." />;
  }

  if (error || !promoIndex) {
    return (
      <View style={styles.errorWrap}>
        <InlineNotice title="No se pudieron cargar los datos" body={error ?? 'Intenta abrir la app de nuevo.'} tone="warning" />
        <SecondaryButton onPress={() => router.push('/manual')}>Ver promos de hoy</SecondaryButton>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 128 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <BrandLockup compact showTagline={false} />
          <View style={styles.topActions}>
            <IconButton icon="time-outline" onPress={() => router.push('/history')} />
            <IconButton icon="options-outline" onPress={() => setSettingsOpen(true)} />
          </View>
        </View>

        <View style={styles.heroArea}>
          <View style={styles.habitCue}>
            <Text style={styles.habitTitle}>Antes de pagar, escaneá.</Text>
            <Text style={styles.habitBody}>Te digo qué app o tarjeta te conviene. Vos aprobás el pago en tu billetera.</Text>
          </View>

          <Animated.View style={[styles.scanMotionWrap, { transform: [{ translateY: scanLift }] }]}>
            <Animated.View style={[styles.scanHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
            <Pressable onPress={() => router.push('/scan')} style={({ pressed }) => [styles.scanCard, pressed && styles.scanCardPressed]}>
              <LinearGradient colors={[colors.accent, colors.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scanFill}>
                <View style={styles.liveRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Mostrame el QR del comercio</Text>
                </View>
                <View style={styles.scanIconWrap}>
                  <Ionicons name="qr-code-outline" size={42} color={colors.teal} />
                </View>
                <Text style={styles.scanLabel}>Escanear QR</Text>
                <Text style={styles.scanMeta}>En segundos sabés con qué pagar</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.accentPressed} />
              <Text style={styles.trustText}>Vos aprobás</Text>
            </View>
            <View style={styles.trustItem}>
              <Ionicons name="pricetag-outline" size={15} color={colors.accentPressed} />
              <Text style={styles.trustText}>Promos claras</Text>
            </View>
            <View style={styles.trustItem}>
              <Ionicons name="megaphone-outline" size={15} color={colors.warning} />
              <Text style={styles.trustText}>Sponsors marcados</Text>
            </View>
          </View>

          <View style={styles.advantageCard}>
            <View style={styles.advantageItem}>
              <Text style={styles.advantageValue}>{hasRealActivity ? formatArs(summary.monthlyNetSavingsArs) : formatArs(displaySummary.monthlyNetSavingsArs)}</Text>
              <Text style={styles.advantageLabel}>{hasRealActivity ? 'para vos este mes' : 'podrías ahorrar'}</Text>
            </View>
            <View style={styles.advantageDivider} />
            <View style={styles.advantageItem}>
              <Text style={styles.advantageValue}>{hasRealActivity ? checksThisMonth : '3'}</Text>
              <Text style={styles.advantageLabel}>{hasRealActivity ? 'veces que miraste' : 'compras ejemplo'}</Text>
            </View>
          </View>

          <View style={styles.momentumCard}>
            <View style={styles.momentumHeader}>
              <View style={styles.momentumIcon}>
                <Ionicons name="flame-outline" size={18} color={colors.warning} />
              </View>
              <View style={styles.momentumCopy}>
                <Text style={styles.momentumTitle}>Pagá con cabeza</Text>
                <Text style={styles.momentumBody}>{smartStreak} compras miradas antes de elegir. Objetivo: que no se te escape {formatArs(monthlyGoalArs)}.</Text>
              </View>
              <Text style={styles.momentumPercent}>{Math.round(goalProgress * 100)}%</Text>
            </View>
            <View style={styles.goalTrack}>
              <View style={[styles.goalFill, { width: `${Math.max(8, Math.round(goalProgress * 100))}%` }]} />
            </View>
          </View>

          {bestNearbyPromo ? (
            <Pressable
              style={styles.promoCard}
              onPress={() => router.push({ pathname: '/manual', params: { merchant: bestNearbyPromo.merchantName } })}
            >
              <View style={styles.promoHeader}>
                <View>
                  <Text style={styles.promoKicker}>Para mirar hoy</Text>
                  <Text style={styles.promoTitle}>{bestNearbyPromo.merchantName}</Text>
                </View>
                <Text style={styles.promoValue}>{formatArs(bestNearbyPromo.likelyNetSavingsArs)}</Text>
              </View>
              <Text style={styles.promoReason}>{bestNearbyPromo.placementReason ?? bestNearbyPromo.reason}</Text>
              {merchantSpotlight ? (
                <View style={styles.sponsoredLine}>
                  <Ionicons name="megaphone-outline" size={14} color={colors.warning} />
                  <Text style={styles.sponsoredText}>Sponsor: {merchantSpotlight.merchantName}. Va separado y marcado, sin tapar la mejor opción para vos.</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          <View style={styles.secondaryArea}>
            <SecondaryButton onPress={() => router.push('/manual')}>Ver promos de hoy</SecondaryButton>
            <Pressable onPress={() => router.push('/checkout-link')}>
              <Text style={styles.linkAction}>Tengo un link de pago</Text>
            </Pressable>
          </View>

          {currentSession ? (
            <Pressable style={styles.resumeCard} onPress={() => router.push('/results')}>
              <Text style={styles.resumeLabel}>Ultima compra mirada</Text>
              <Text numberOfLines={1} style={styles.resumeMerchant}>{currentSession.match.merchant_name}</Text>
            </Pressable>
          ) : null}

          {!currentSession && quickMerchantNames.length > 0 ? (
            <View style={styles.quickArea}>
              <Text style={styles.quickLabel}>Lugares para chusmear promos</Text>
              <View style={styles.quickRow}>
                {quickMerchantNames.map((merchant) => (
                  <Pressable
                    key={merchant}
                    style={styles.quickChip}
                    onPress={() => router.push({ pathname: '/manual', params: { merchant } })}
                  >
                    <Text numberOfLines={1} style={styles.quickChipLabel}>{merchant}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable style={styles.shareNudge} onPress={() => void sharePagamax()}>
            <Ionicons name="people-outline" size={18} color={colors.accentPressed} />
            <Text style={styles.shareNudgeText}>Pasáselo a alguien que siempre paga de más</Text>
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} title="Centro de control">
        <ToggleRow
          title="Notificaciones"
          body="Avisos solo si valen la pena."
          value={settings.notificationsEnabled}
          onValueChange={(value) => updateSettings({ notificationsEnabled: value })}
        />
        <ToggleRow
          title="Modo de optimizacion"
          body={settings.optimizationMode === 'max_savings' ? 'Busca mas plata para vos.' : 'Busca menos vueltas.'}
          value={settings.optimizationMode === 'fastest_checkout'}
          onValueChange={(value) => updateSettings({ optimizationMode: value ? 'fastest_checkout' : 'max_savings' })}
        />
        <SecondaryButton onPress={() => router.push('/profile')}>Abrir preferencias</SecondaryButton>
        <SecondaryButton onPress={() => router.push('/privacy')}>Politica de privacidad</SecondaryButton>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    minHeight: '100%',
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  errorWrap: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.md,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 48,
    zIndex: 2,
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heroArea: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    gap: spacing.md,
  },
  habitCue: {
    gap: spacing.xxs,
  },
  habitTitle: {
    ...typography.headingLg,
    color: colors.ink,
    textAlign: 'center',
  },
  habitBody: {
    ...typography.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  scanCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  scanMotionWrap: {
    position: 'relative',
  },
  scanHalo: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    bottom: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
  },
  scanCardPressed: {
    transform: [{ scale: 0.985 }],
  },
  scanFill: {
    minHeight: 268,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  liveRow: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.whiteSoft,
  },
  liveText: {
    ...typography.caption,
    color: colors.whiteSoft,
  },
  scanIconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.whiteSoft,
    marginTop: spacing.xl,
  },
  scanLabel: {
    ...typography.displayLg,
    color: colors.white,
    textAlign: 'center',
  },
  scanMeta: {
    ...typography.headingSm,
    color: colors.whiteSoft,
    textAlign: 'center',
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  trustText: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  advantageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    ...shadows.sm,
  },
  advantageItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  advantageValue: {
    ...typography.headingLg,
    color: colors.teal,
  },
  advantageLabel: {
    ...typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  advantageDivider: {
    width: 1,
    height: 42,
    backgroundColor: colors.divider,
  },
  secondaryArea: {
    gap: spacing.sm,
  },
  momentumCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  momentumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  momentumIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
  },
  momentumCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  momentumTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  momentumBody: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  momentumPercent: {
    ...typography.headingSm,
    color: colors.teal,
  },
  goalTrack: {
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.warning,
  },
  promoCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.whiteSoft,
    borderWidth: 1,
    borderColor: colors.warningSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  promoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  promoKicker: {
    ...typography.caption,
    color: colors.warning,
  },
  promoTitle: {
    ...typography.headingLg,
    color: colors.ink,
  },
  promoValue: {
    ...typography.headingLg,
    color: colors.teal,
    textAlign: 'right',
  },
  promoReason: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  sponsoredLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  sponsoredText: {
    ...typography.caption,
    color: colors.inkMuted,
    flex: 1,
  },
  linkAction: {
    ...typography.headingSm,
    color: colors.accentPressed,
    textAlign: 'center',
  },
  resumeCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  resumeLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  resumeMerchant: {
    ...typography.headingSm,
    color: colors.ink,
  },
  quickArea: {
    gap: spacing.sm,
  },
  quickLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickChip: {
    maxWidth: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickChipLabel: {
    ...typography.headingSm,
    color: colors.ink,
  },
  shareNudge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  shareNudgeText: {
    ...typography.caption,
    color: colors.accentPressed,
  },
});
