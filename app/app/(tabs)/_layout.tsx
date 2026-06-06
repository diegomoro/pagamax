import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs, router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingActionButton } from '@/components/ui';
import { colors, shadows } from '@/lib/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.inkMuted,
          tabBarStyle: {
            backgroundColor: colors.surfaceElevated,
            borderTopWidth: 0,
            height: 64 + insets.bottom,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            ...shadows.md,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '700',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          listeners={{
            tabPress: () => {
              void Haptics.selectionAsync();
            },
          }}
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="methods"
          listeners={{
            tabPress: () => {
              void Haptics.selectionAsync();
            },
          }}
          options={{
            title: 'Mis medios',
            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'wallet' : 'wallet-outline'} color={color} size={size} />,
          }}
        />
      </Tabs>
      <FloatingActionButton onPress={() => router.push('/scan')} />
    </View>
  );
}
