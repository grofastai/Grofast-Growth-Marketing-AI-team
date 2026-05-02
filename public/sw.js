const CACHE = 'grofast-v1'
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (!url.origin.includes(self.location.origin.split('//')[1])) return
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
