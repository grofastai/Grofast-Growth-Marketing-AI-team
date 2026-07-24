import { describe, it, expect } from "vitest"
import { nextRetryState } from "./document-sync"

describe("nextRetryState", () => {
  it("stays pending before the 5th attempt", () => {
    expect(nextRetryState(0)).toEqual({ attempts: 1, status: "pending" })
    expect(nextRetryState(3)).toEqual({ attempts: 4, status: "pending" })
  })

  it("flips to failed on the 5th attempt", () => {
    expect(nextRetryState(4)).toEqual({ attempts: 5, status: "failed" })
  })

  it("stays failed for attempts beyond 5", () => {
    expect(nextRetryState(5)).toEqual({ attempts: 6, status: "failed" })
  })
})
