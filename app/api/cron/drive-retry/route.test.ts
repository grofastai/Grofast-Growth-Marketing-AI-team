import { describe, it, expect } from "vitest"
import { GET } from "./route"
import { NextRequest } from "next/server"

function makeRequest(authHeader?: string) {
  const headers = new Headers()
  if (authHeader) headers.set("authorization", authHeader)
  return new NextRequest(new URL("http://localhost/api/cron/drive-retry"), { headers })
}

describe("GET /api/cron/drive-retry", () => {
  it("returns 401 with no auth", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns 401 with wrong cron secret", async () => {
    process.env.CRON_SECRET = "correct"
    const res = await GET(makeRequest("Bearer wrong"))
    expect(res.status).toBe(401)
    delete process.env.CRON_SECRET
  })
})
