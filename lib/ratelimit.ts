import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function makeRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

const redis = makeRedis()

function makeLimiter(requests: number, window: `${number} s` | `${number} m` | `${number} h`) {
  if (!redis) return null
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(requests, window) })
}

// 5 login attempts per IP per minute
export const loginLimiter  = makeLimiter(5, '60 s')
// 5 support tickets per user per 10 minutes
export const ticketLimiter = makeLimiter(5, '10 m')
// 20 replies per user per 10 minutes
export const replyLimiter  = makeLimiter(20, '10 m')
// 5 file uploads per user per 10 minutes
export const uploadLimiter = makeLimiter(5, '10 m')
