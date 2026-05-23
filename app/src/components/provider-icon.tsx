import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/lib/theme';

const PROVIDER_COLORS: Record<string, string> = {
  mercadopago: '#009ee3',
  modo: '#00b1a8',
  naranjax: '#ff6a13',
  bbva: '#1332aa',
  uala: '#6d52ff',
  personalpay: '#1f8ef1',
  cuentadni: '#1f7a4d',
  ypf: '#1544b0',
  shellbox: '#cf1f2f',
  carrefour_bank: '#0066cc',
  bna: '#00a3e0',
  bancon: '#006747',
};

export function ProviderIcon({ provider, size = 42 }: { provider: string; size?: number }) {
  const backgroundColor = PROVIDER_COLORS[provider] ?? colors.ink;
  const initial = provider.slice(0, 1).toUpperCase();

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Text style={styles.label}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    padding: spacing.xs,
  },
  label: {
    ...typography.headingSm,
    color: colors.white,
  },
});
