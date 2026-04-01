import { Linking } from 'react-native';
import { getPaymentAppConfig } from '@/config/payment-apps';

export async function openPaymentApp(provider: string): Promise<'deep_link' | 'store'> {
  const config = getPaymentAppConfig(provider);

  if (config.verifiedDeepLink) {
    try {
      await Linking.openURL(config.verifiedDeepLink);
      return 'deep_link';
    } catch {
      // Fall through to Play Store.
    }
  }

  await Linking.openURL(config.playStoreUrl);
  return 'store';
}
