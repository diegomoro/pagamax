import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PagamaxProvider } from '@/context/pagamax-context';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PagamaxProvider>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surface,
            },
            headerTintColor: colors.ink,
            headerShadowVisible: false,
            contentStyle: {
              backgroundColor: colors.background,
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'Escanear QR', presentation: 'modal' }} />
          <Stack.Screen name="manual" options={{ title: 'Ingreso manual', presentation: 'modal' }} />
          <Stack.Screen name="results" options={{ title: 'Recomendaciones' }} />
          <Stack.Screen name="detail" options={{ title: 'Detalle del beneficio' }} />
        </Stack>
      </PagamaxProvider>
    </SafeAreaProvider>
  );
}
