import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getCroppedImageBlob } from "./crop"

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ""
  set src(value: string) {
    this._src = value
    queueMicrotask(() => this.onload?.())
  }
  get src() { return this._src }
}

function makeFakeCanvas() {
  const drawCalls: unknown[][] = []
  const canvas = {
    width: 0,
    height: 0,
    getContext: (_type: string) => ({
      drawImage: (...args: unknown[]) => { drawCalls.push(args) },
    }),
    toBlob: (cb: (b: Blob | null) => void, type: string) => {
      cb(new Blob(["fake-jpeg-bytes"], { type }))
    },
  }
  return { canvas, drawCalls }
}

describe("getCroppedImageBlob", () => {
  let fakeCanvas: ReturnType<typeof makeFakeCanvas>

  beforeEach(() => {
    fakeCanvas = makeFakeCanvas()
    vi.stubGlobal("Image", FakeImage)
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag === "canvas") return fakeCanvas.canvas
        throw new Error(`Unexpected createElement(${tag})`)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sizes the canvas to the requested output size", async () => {
    await getCroppedImageBlob("blob:fake-src", { x: 0, y: 0, width: 200, height: 200 }, 512)
    expect(fakeCanvas.canvas.width).toBe(512)
    expect(fakeCanvas.canvas.height).toBe(512)
  })

  it("draws exactly the requested crop region scaled to the output size", async () => {
    await getCroppedImageBlob("blob:fake-src", { x: 10, y: 20, width: 100, height: 100 }, 512)
    expect(fakeCanvas.drawCalls).toHaveLength(1)
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = fakeCanvas.drawCalls[0]
    expect([sx, sy, sw, sh, dx, dy, dw, dh]).toEqual([10, 20, 100, 100, 0, 0, 512, 512])
  })

  it("resolves with a JPEG blob", async () => {
    const blob = await getCroppedImageBlob("blob:fake-src", { x: 0, y: 0, width: 50, height: 50 }, 256)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe("image/jpeg")
  })

  it("rejects if the image fails to load", async () => {
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
    })
    await expect(
      getCroppedImageBlob("blob:bad-src", { x: 0, y: 0, width: 10, height: 10 }, 512),
    ).rejects.toThrow("Failed to load image")
  })
})
