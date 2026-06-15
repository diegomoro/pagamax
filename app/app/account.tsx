import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Card, IconButton, InlineNotice, Pill, PrimaryButton, ScreenScroll, SecondaryButton } from '@/components/ui';
import { hasManagedBackend, requestAccountMagicLink } from '@/lib/backend';
import { usePagamax } from '@/context/pagamax-context';
import { colors, radius, spacing, typography } from '@/lib/theme';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function describeSyncStatus(status: 'local_only' | 'pending_backend' | 'synced'): string {
  if (status === 'synced') return 'sincronizada';
  if (status === 'pending_backend') return 'pendiente';
  return 'local';
}

export default function AccountScreen() {
  const { account, createAccount, signOutAccount } = usePagamax();
  const backendConfigured = hasManagedBackend();
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [phoneLabel, setPhoneLabel] = useState(account?.phoneLabel ?? 'Pixel 8a');
  const [inviteCode, setInviteCode] = useState(account?.inviteCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  const canSave = displayName.trim().length >= 2 && isValidEmail(email) && !saving;

  async function handleSave() {
    setError(null);

    if (displayName.trim().length < 2) {
      setError('Completa tu nombre.');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Usá un email válido.');
      return;
    }

    setSaving(true);
    try {
      await createAccount({
        displayName,
        email,
        phoneLabel,
        inviteCode,
      });
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMagicLink() {
    setError(null);
    setAuthMessage(null);
    if (!isValidEmail(email)) {
      setError('Usá un email válido para recibir el link.');
      return;
    }

    setSendingLink(true);
    try {
      const result = await requestAccountMagicLink(email.trim(), displayName.trim() || undefined);
      setAuthMessage(result?.devExchangeUrl
        ? `Modo dev: abre ${result.devExchangeUrl}`
        : result
          ? 'Te mandamos el link de acceso al email.'
          : 'Falta configurar el backend público para mandar links de acceso.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar el link.');
    } finally {
      setSendingLink(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Cerrar sesión', 'Se cierra la sesión de este teléfono. Tus datos sincronizados siguen disponibles hasta que elimines la cuenta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar',
        style: 'destructive',
        onPress: () => {
          void signOutAccount();
          router.replace('/account');
        },
      },
    ]);
  }

  return (
    <ScreenScroll contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Text style={styles.title}>{account ? 'Tu cuenta' : 'Crear cuenta'}</Text>
        <View style={styles.placeholder} />
      </View>

      {account ? (
        <View style={styles.statusRow}>
          <Pill label={describeSyncStatus(account.syncStatus)} tone={account.syncStatus === 'synced' ? 'success' : 'warning'} />
          <Text style={styles.statusText}>{account.emailVerified ? 'Email verificado' : 'Email pendiente'} - {new Date(account.updatedAt).toLocaleDateString('es-AR')}</Text>
        </View>
      ) : (
        <InlineNotice
          title="Tu cuenta de Paga Menos"
          body={backendConfigured ? 'Usamos email para sincronizar preferencias, privacidad y eliminación de cuenta.' : 'Este build todavía no tiene backend público; la cuenta queda pendiente de sincronización.'}
          tone={backendConfigured ? 'default' : 'warning'}
        />
      )}

      <Card style={styles.formCard}>
        <View style={styles.field}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Diego"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="diego@email.com"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            autoCapitalize="sentences"
            autoCorrect={false}
            placeholder="Pixel 8a"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={phoneLabel}
            onChangeText={setPhoneLabel}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Invite</Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="opcional"
            placeholderTextColor={colors.inkMuted}
            style={styles.input}
            value={inviteCode}
            onChangeText={setInviteCode}
          />
        </View>

        {error ? <InlineNotice title="Revisa estos datos" body={error} tone="warning" /> : null}
        {authMessage ? <InlineNotice title="Acceso por email" body={authMessage} tone="default" /> : null}
      </Card>

      <View style={styles.actions}>
        <PrimaryButton onPress={() => void handleSave()} disabled={!canSave} style={!canSave ? styles.disabled : undefined}>
          {saving ? 'Guardando...' : account ? 'Guardar cuenta' : 'Crear cuenta'}
        </PrimaryButton>
        {backendConfigured ? (
          <SecondaryButton onPress={() => void handleMagicLink()} disabled={sendingLink}>
            {sendingLink ? 'Enviando...' : 'Enviar link de acceso'}
          </SecondaryButton>
        ) : null}
        {account ? (
          <SecondaryButton onPress={handleSignOut}>Cerrar sesión</SecondaryButton>
        ) : (
          <SecondaryButton onPress={() => router.replace('/')}>Ahora no</SecondaryButton>
        )}
        {account ? (
          <SecondaryButton onPress={() => router.push('/delete-account')}>Eliminar cuenta y datos</SecondaryButton>
        ) : null}
      </View>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusText: {
    ...typography.caption,
    color: colors.inkMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  formCard: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  help: {
    ...typography.caption,
    color: colors.inkMuted,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    ...typography.bodyLg,
  },
  actions: {
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.45,
  },
});
