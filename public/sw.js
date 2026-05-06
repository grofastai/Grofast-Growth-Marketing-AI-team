const CACHE = 'grofast-v2'
const OFFLINE = '/offline'
const PRECACHE = ['/', '/offline', '/login']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('push', e => {
  let data = { title: 'GroFast', body: 'You have a new notification.' }
  try { data = e.data.json() } catch { /* use defaults */ }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/file.svg',
      badge: '/file.svg',
      data: data.url ?? '/',
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data ?? '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  let url
  try {
    url = new URL(e.request.url)
  } catch {
    return
  }

  // Only handle plain HTTP/HTTPS requests to our own origin.
  // Skips chrome-error://, chrome-extension://, data:, etc.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return
  if (url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.includes('manifest')
  ) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          try {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
          } catch { /* ignore unclonable responses */ }
        }
        return res
      })
      .catch(() =>
        caches.match(e.request).then(cached => cached ?? caches.match(OFFLINE))
      )
  )
})
