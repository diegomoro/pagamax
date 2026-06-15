import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, Chip, IconButton, InlineNotice, PrimaryButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { FUNDING_DESTINATIONS_ENABLED } from '@/config/public-build';
import { usePagamax } from '@/context/pagamax-context';
import { hasManagedBackend } from '@/lib/backend';
import { colors, radius, spacing, typography } from '@/lib/theme';
import type { FundingLookupKind, ResolvedFundingDestination } from '@/types/app';

const LOOKUP_LABELS: Record<FundingLookupKind, string> = {
  alias: 'Alias',
  cbu: 'CBU',
  cvu: 'CVU',
};

function formatIdentity(value: ResolvedFundingDestination): string {
  if (!value.ownerIdentityLast4) return 'No informado';
  return `${value.ownerIdentityKind?.toUpperCase() ?? 'CUIL/DNI'} termina en ${value.ownerIdentityLast4}`;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || 'No informado'}</Text>
    </View>
  );
}

export default function FundingDestinationScreen() {
  const { account, confirmFundingDestination, resolveFundingDestination } = usePagamax();
  const [lookupKind, setLookupKind] = useState<FundingLookupKind>('alias');
  const [lookupValue, setLookupValue] = useState('');
  const [resolved, setResolved] = useState<ResolvedFundingDestination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const backendConfigured = hasManagedBackend();
  const identityReady = account?.identityVerificationStatus === 'same_owner_verified' && Boolean(account.identityHash);
  const canResolve = backendConfigured && identityReady && lookupValue.trim().length >= 6 && !loading;
  const canConfirm = Boolean(resolved?.sameOwner) && !saving;

  if (!FUNDING_DESTINATIONS_ENABLED) {
    return (
      <ScreenScroll contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-back" onPress={() => router.back()} />
          <Text style={styles.title}>Cuenta propia</Text>
          <View style={styles.placeholder} />
        </View>
        <InlineNotice
          title="Función no disponible"
          body="La versión pública de Paga Menos recomienda cómo pagar, pero no valida ni guarda alias, CBU o CVU."
          tone="warning"
        />
        <SecondaryButton onPress={() => router.replace('/(tabs)/methods')}>Volver</SecondaryButton>
      </ScreenScroll>
    );
  }

  async function handleResolve() {
    setError(null);
    setResolved(null);
    setLoading(true);
    try {
      const result = await resolveFundingDestination({ lookupKind, lookupValue });
      setResolved(result);
      if (!result.sameOwner) {
        setError('No coincide con tu DNI/CUIL. No se puede agregar esta cuenta.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos validar esa cuenta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!resolved) return;
    setError(null);
    setSaving(true);
    try {
      await confirmFundingDestination(resolved);
      router.replace('/(tabs)/methods');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo agregar la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>Agregar cuenta propia</Text>
        <View style={styles.placeholder} />
      </View>

      {!backendConfigured ? (
        <InlineNotice
          title="Validacion no disponible"
          body="Para agregar cuentas por alias, CBU o CVU necesitamos backend activo y consulta de titularidad."
          tone="warning"
        />
      ) : null}

      {account && !identityReady ? (
        <InlineNotice
          title="Falta validar tu identidad"
          body="Primero validá tu DNI/CUIL principal. Después solo vas a poder agregar cuentas a tu nombre."
          tone="warning"
        />
      ) : null}

      {!account ? (
        <InlineNotice
          title="Primero crea tu cuenta"
          body="La cuenta propia se compara contra el DNI/CUIL guardado en tu perfil."
          tone="warning"
        />
      ) : null}

      <Card style={styles.card}>
        <View style={styles.chips}>
          {(['alias', 'cbu', 'cvu'] as FundingLookupKind[]).map((option) => (
            <Chip
              key={option}
              label={LOOKUP_LABELS[option]}
              selected={lookupKind === option}
              onPress={() => {
                setLookupKind(option);
                setResolved(null);
                setError(null);
              }}
            />
          ))}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{LOOKUP_LABELS[lookupKind]}</Text>
          <TextInput
            autoCapitalize={lookupKind === 'alias' ? 'characters' : 'none'}
            autoCorrect={false}
            keyboardType={lookupKind === 'alias' ? 'default' : 'number-pad'}
            placeholder={lookupKind === 'alias' ? 'mi.alias.banco' : lookupKind === 'cbu' ? '22 digitos' : '22 digitos'}
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={lookupValue}
            onChangeText={(value) => {
              setLookupValue(value);
              setResolved(null);
              setError(null);
            }}
          />
        </View>

        <PrimaryButton onPress={() => void handleResolve()} disabled={!canResolve} style={!canResolve ? styles.disabled : undefined}>
          {loading ? 'Validando...' : 'Ver datos'}
        </PrimaryButton>
      </Card>

      {resolved ? (
        <Card style={styles.card}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={styles.resultTitle}>{resolved.bankName}</Text>
              <Text style={styles.resultSubtitle}>{resolved.accountLabel ?? resolved.provider}</Text>
            </View>
            <Text style={[styles.status, resolved.sameOwner ? styles.statusOk : styles.statusBlocked]}>
              {resolved.sameOwner ? 'Coincide' : 'Bloqueada'}
            </Text>
          </View>

          <DetailRow label="Titular" value={resolved.holderName} />
          <DetailRow label="CUIL/DNI" value={formatIdentity(resolved)} />
          <DetailRow label="Alias" value={resolved.alias} />
          <DetailRow label="CBU" value={resolved.cbuMasked} />
          <DetailRow label="CVU" value={resolved.cvuMasked} />

          <InlineNotice
            title={resolved.sameOwner ? 'Revisa antes de agregar' : 'No se puede agregar'}
            body={resolved.sameOwner
              ? 'Agregala solo si banco, titular y CUIL/DNI se ven correctos.'
              : 'El titular no coincide con tu DNI/CUIL principal. Paga Menos no permite usarla para fondeo interno.'}
            tone={resolved.sameOwner ? 'default' : 'warning'}
          />

          <PrimaryButton onPress={() => void handleConfirm()} disabled={!canConfirm} style={!canConfirm ? styles.disabled : undefined}>
            {saving ? 'Agregando...' : 'Se ve correcto, agregar'}
          </PrimaryButton>
        </Card>
      ) : null}

      {error ? <InlineNotice title="Revisa la cuenta" body={error} tone="warning" /> : null}

      <SecondaryButton onPress={() => router.replace('/(tabs)/methods')}>Volver</SecondaryButton>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  placeholder: {
    width: 44,
  },
  title: {
    ...typography.headingLg,
    color: colors.ink,
  },
  card: {
    gap: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    ...typography.bodyLg,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  resultTitle: {
    ...typography.headingSm,
    color: colors.ink,
  },
  resultSubtitle: {
    ...typography.bodySm,
    color: colors.inkMuted,
  },
  status: {
    ...typography.caption,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  statusOk: {
    backgroundColor: colors.tealSoft,
    color: colors.teal,
  },
  statusBlocked: {
    backgroundColor: colors.warningSoft,
    color: colors.warning,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: spacing.sm,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  detailValue: {
    ...typography.bodySm,
    color: colors.ink,
    flex: 1,
    textAlign: 'right',
  },
  disabled: {
    opacity: 0.45,
  },
});
