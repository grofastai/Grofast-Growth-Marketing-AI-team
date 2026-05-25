import { Redis } from '@upstash/redis'

function makeRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

const redis = makeRedis()

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null
  try { return await redis.get<T>(key) } catch { return null }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return
  try { await redis.set(key, value, { ex: ttlSeconds }) } catch { /* non-fatal */ }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return
  try { await redis.del(...keys as [string, ...string[]]) } catch { /* non-fatal */ }
}
