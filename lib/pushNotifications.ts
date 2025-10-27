/**
 * Push Notifications Client Utility
 *
 * Handles:
 * - Service worker registration
 * - Push subscription management
 * - Notification permission requests
 */

// Note: You'll need to generate VAPID keys for production
// Run: npx web-push generate-vapid-keys
// Then add the public key here and private key to server env
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib27SggHE-rdaw-juFh1oKxXjOA_FLDkwZ3QjVxDxcY4BaH0MKnJJQVcwLo';

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if browser supports push notifications
 */
export function isPushNotificationSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker not supported');
  }

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/'
  });

  console.log('✅ Service Worker registered:', registration);
  return registration;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(): Promise<PushSubscription> {
  try {
    // 1. Check support
    if (!isPushNotificationSupported()) {
      throw new Error('Push notifications not supported');
    }

    // 2. Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // 3. Register service worker
    const registration = await registerServiceWorker();

    // 4. Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // 5. Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
    });

    console.log('✅ Push subscription created:', subscription);

    // 6. Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    return subscription;
  } catch (err) {
    console.error('❌ Failed to subscribe to push notifications:', err);
    throw err;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log('No subscription found');
      return false;
    }

    // Unsubscribe on client
    const success = await subscription.unsubscribe();

    // Notify server
    if (success) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
    }

    console.log('✅ Push subscription removed');
    return success;
  } catch (err) {
    console.error('❌ Failed to unsubscribe:', err);
    return false;
  }
}

/**
 * Get current push subscription
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    if (!isPushNotificationSupported()) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription;
  } catch (err) {
    console.error('❌ Failed to get subscription:', err);
    return null;
  }
}

/**
 * Check if user is subscribed to push notifications
 */
export async function isSubscribedToPush(): Promise<boolean> {
  const subscription = await getPushSubscription();
  return subscription !== null;
}
