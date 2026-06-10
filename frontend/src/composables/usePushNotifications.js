import { ref } from 'vue'

const isSubscribed = ref(false)

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function fetchVAPIDPublicKey() {
  const res = await fetch('/api/v1/push/vapid-public-key')
  if (!res.ok) return null
  const data = await res.json()
  return data.publicKey || null
}

async function saveSubscription(subscription, workspaceId) {
  const key = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  await fetch('/api/v1/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
        auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
      },
      workspaceId: workspaceId || '',
    }),
  })
}

async function deleteSubscription(endpoint) {
  await fetch('/api/v1/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

export function usePushNotifications() {
  async function subscribe(workspaceId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const publicKey = await fetchVAPIDPublicKey()
    if (!publicKey) return

    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await saveSubscription(existing, workspaceId)
        isSubscribed.value = true
        return
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      await saveSubscription(subscription, workspaceId)
      isSubscribed.value = true
    } catch {
      // Silently ignore — push is optional
    }
  }

  async function unsubscribe() {
    if (!('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) return
      await deleteSubscription(sub.endpoint)
      await sub.unsubscribe()
      isSubscribed.value = false
    } catch {
      // Silently ignore
    }
  }

  return { subscribe, unsubscribe, isSubscribed }
}
