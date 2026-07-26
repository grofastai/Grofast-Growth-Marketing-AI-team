# Photo Upload Crop Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared circular crop step between "user picks a photo" and "photo gets uploaded," at three upload points: the member profile avatar, the member profile payslip/passport photo, and the admin Team edit-member passport photo upload.

**Architecture:** One framework-agnostic canvas utility (`getCroppedImageBlob`) exports a fixed-size JPEG from a crop selection; one shared React modal (`PhotoCropModal`, built on `react-easy-crop`) drives the crop UI and calls that utility. All three call sites are changed identically: the file-picker's `onChange` now opens the modal instead of uploading immediately, and the modal's `onConfirm` hands back a cropped `Blob` that gets wrapped in a `File` and passed into the **existing, unmodified** upload handler.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict mode, `react-easy-crop` (new dependency), Vitest.

## Global Constraints

- Crop is always circular, 1:1 aspect ratio, all three call sites — no other aspect ratio is in scope (spec: "Both fields are circular in every real display context").
- Output is always a 512×512 JPEG at quality 0.9, produced entirely client-side — no server-side image processing.
- `/api/upload-photo/route.ts` and the `uploadPassportPhoto` Server Action (`lib/actions/team.ts:497`) are **not modified** — both already accept anything under `FormData`'s `"file"` key.
- KYC document uploads (Aadhaar/PAN/ration card) and the preset-avatar picker are out of scope — do not touch `handleDocUpload`/`handleDocReplace` in `profile-client.tsx`.
- New dependency: `react-easy-crop` only. No other new dependency (no jsdom, no canvas package — the crop utility is unit-tested with hand-written mocks, matching this repo's existing test style of testing pure logic only, never full component rendering).
- Follow existing code style exactly: inline `style={{}}` objects (not Tailwind classes) for one-off visual styling in these files, matching `ConfirmDialog.tsx` and the surrounding code in `profile-client.tsx` / `team-client.tsx`.

---

## File Structure

- **Create** `lib/image/crop.ts` — pure utility, no React/DOM framework dependency beyond browser globals (`Image`, `document.createElement("canvas")`). Exports `getCroppedImageBlob`.
- **Create** `lib/image/crop.test.ts` — Vitest unit tests for `getCroppedImageBlob`, using hand-stubbed `Image`/`document` globals (no jsdom).
- **Create** `components/ui/PhotoCropModal.tsx` — shared modal component wrapping `react-easy-crop`, used identically by both files below.
- **Modify** `app/member/profile/profile-client.tsx` — wire both the avatar upload (`photoRef` input, line 389) and the payslip photo upload (`profPhotoRef` input, line 780) through `PhotoCropModal`.
- **Modify** `app/admin/team/team-client.tsx` — wire the `MemberSheet` component's passport-photo upload (`handlePhotoSelect`, line 320) through `PhotoCropModal`.
- **Modify** `package.json` — add `react-easy-crop`.

---

### Task 1: Add the `react-easy-crop` dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: the `react-easy-crop` package (default export `Cropper`, named type `Area`) available to import in Task 3.

- [ ] **Step 1: Install the package**

Run: `pnpm add react-easy-crop`

Expected: `package.json`'s `dependencies` gains a `"react-easy-crop": "^6.2.3"` (or newer) line, and `pnpm-lock.yaml` updates. No peer-dependency warnings — it declares `react: >=16.4.0` and `react-dom: >=16.4.0`, both satisfied by this project's React 19.2.4.

- [ ] **Step 2: Verify it installed cleanly**

Run: `pnpm typecheck`
Expected: passes with no new errors (this step just installs the package; nothing imports it yet).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add react-easy-crop dependency"
```

---

### Task 2: Build the crop-to-blob utility (TDD)

**Files:**
- Create: `lib/image/crop.ts`
- Create: `lib/image/crop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CropPixels = { x: number; y: number; width: number; height: number }
  export function getCroppedImageBlob(
    imageSrc: string,
    cropPixels: CropPixels,
    outputSize: number,
  ): Promise<Blob>
  ```
  `react-easy-crop`'s `onCropComplete(_area, areaPixels)` callback (used in Task 3) hands back an object shaped `{ x, y, width, height }` — structurally identical to `CropPixels`, so it can be passed straight through with no conversion.

- [ ] **Step 1: Write the failing test**

Create `lib/image/crop.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/image/crop.test.ts`
Expected: FAIL — `Cannot find module './crop'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/image/crop.ts`:

```ts
export type CropPixels = { x: number; y: number; width: number; height: number }

// Draws the given crop region of the source image onto a square canvas at
// outputSize x outputSize and exports it as a JPEG blob. Used to turn a
// react-easy-crop selection into the file that actually gets uploaded.
export function getCroppedImageBlob(
  imageSrc: string,
  cropPixels: CropPixels,
  outputSize: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas not supported")); return }
      ctx.drawImage(
        image,
        cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
        0, 0, outputSize, outputSize,
      )
      canvas.toBlob(
        blob => { blob ? resolve(blob) : reject(new Error("Failed to export cropped image")) },
        "image/jpeg",
        0.9,
      )
    }
    image.onerror = () => reject(new Error("Failed to load image"))
    image.src = imageSrc
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/image/crop.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/image/crop.ts lib/image/crop.test.ts
git commit -m "feat: add client-side crop-to-blob utility"
```

---

### Task 3: Build the shared `PhotoCropModal` component

**Files:**
- Create: `components/ui/PhotoCropModal.tsx`

**Interfaces:**
- Consumes: `getCroppedImageBlob(imageSrc, cropPixels, outputSize)` from Task 2 (`@/lib/image/crop`).
- Produces:
  ```ts
  type PhotoCropModalProps = {
    open: boolean
    imageSrc: string | null
    onCancel: () => void
    onConfirm: (blob: Blob) => void
  }
  export function PhotoCropModal(props: PhotoCropModalProps): JSX.Element | null
  ```
  Tasks 4 and 5 render this with `imageSrc` set to an object URL of the just-picked file, and receive a 512×512 JPEG `Blob` in `onConfirm`.

- [ ] **Step 1: Create the component**

Create `components/ui/PhotoCropModal.tsx`:

```tsx
"use client"

import { useCallback, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { Loader2 } from "lucide-react"
import { getCroppedImageBlob } from "@/lib/image/crop"

type PhotoCropModalProps = {
  open: boolean
  imageSrc: string | null
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

const OUTPUT_SIZE = 512

export function PhotoCropModal({ open, imageSrc, onCancel, onConfirm }: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  function reset() {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setBusy(false)
    setError(null)
  }

  function handleCancel() {
    reset()
    onCancel()
  }

  async function handleSave() {
    if (!imageSrc || !croppedAreaPixels) return
    setBusy(true)
    setError(null)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, OUTPUT_SIZE)
      reset()
      onConfirm(blob)
    } catch {
      setError("Couldn't process that photo — try again")
      setBusy(false)
    }
  }

  if (!open || !imageSrc) return null

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`.pcm-btn:focus-visible{outline:2px solid #DE1A1A;outline-offset:2px;}`}</style>
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(10,10,15,0.6)", backdropFilter: "blur(6px)" }}
        onClick={handleCancel}
      />
      <div style={{ position: "relative", background: "#fff", borderRadius: 22, padding: 20, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
        <p style={{ fontSize: 15, fontWeight: 900, color: "#111111", margin: "0 0 4px" }}>Adjust Photo</p>
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 14px" }}>Drag to reposition, pinch or scroll to zoom</p>

        <div style={{ position: "relative", width: "100%", height: 320, borderRadius: 16, overflow: "hidden", background: "#111827" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <input
          type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          className="pcm-btn"
          style={{ width: "100%", margin: "14px 0 4px", accentColor: "#DE1A1A" }}
          aria-label="Zoom"
        />

        {error && <p style={{ fontSize: 11, color: "#DC2626", margin: "6px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={handleCancel} disabled={busy}
            className="pcm-btn"
            style={{ flex: 1, padding: "11px 18px", borderRadius: 13, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={busy || !croppedAreaPixels}
            className="pcm-btn"
            style={{ flex: 1, padding: "11px 18px", borderRadius: 13, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13.5, color: "#fff", background: "linear-gradient(135deg,#DE1A1A 0%,#8B1212 100%)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy || !croppedAreaPixels ? 0.7 : 1 }}
          >
            {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            {busy ? "Saving…" : "Save Photo"}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: passes with no errors (component isn't imported anywhere yet, but must be internally consistent — `Area` type, `Cropper` props, and `getCroppedImageBlob`'s signature must all line up).

- [ ] **Step 3: Commit**

```bash
git add components/ui/PhotoCropModal.tsx
git commit -m "feat: add shared circular photo-crop modal"
```

---

### Task 4: Wire the crop modal into the Member Profile page

**Files:**
- Modify: `app/member/profile/profile-client.tsx`

**Interfaces:**
- Consumes: `PhotoCropModal` from `@/components/ui/PhotoCropModal` (Task 3).
- Consumes (unchanged, already exist in this file): `handlePhotoUpload(file: File)` (line 213), `handleProfPhotoUpload(file: File)` (line 223).

- [ ] **Step 1: Import the modal**

In `app/member/profile/profile-client.tsx`, add to the top imports (after the `INDIAN_BANKS` import, line 19):

```ts
import { PhotoCropModal } from "@/components/ui/PhotoCropModal"
```

- [ ] **Step 2: Add crop-flow state**

Find this block (around line 154, right after `profPhotoUrl` state):

```ts
  const [profPhotoUrl, setProfPhotoUrl]   = useState<string | null>(profile?.passport_photo_url ?? null)
  const [logoutPending, startLogout] = useTransition()
```

Replace with:

```ts
  const [profPhotoUrl, setProfPhotoUrl]   = useState<string | null>(profile?.passport_photo_url ?? null)
  const [cropTarget, setCropTarget]       = useState<"avatar" | "passport" | null>(null)
  const [cropImageSrc, setCropImageSrc]   = useState<string | null>(null)
  const [logoutPending, startLogout] = useTransition()
```

- [ ] **Step 3: Add the crop-flow handlers**

Find `handleProfPhotoUpload` (ends around line 238, right before the old `handleChangePassword`). Add these three new functions immediately after it:

```ts
  function openCrop(target: "avatar" | "passport", file: File) {
    setCropTarget(target)
    setCropImageSrc(URL.createObjectURL(file))
  }
  function closeCrop() {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc)
    setCropTarget(null)
    setCropImageSrc(null)
  }
  function handleCropConfirm(blob: Blob) {
    const target = cropTarget
    closeCrop()
    if (target === "avatar") {
      handlePhotoUpload(new File([blob], "avatar.jpg", { type: "image/jpeg" }))
    } else if (target === "passport") {
      handleProfPhotoUpload(new File([blob], "professional-photo.jpg", { type: "image/jpeg" }))
    }
  }
```

- [ ] **Step 4: Redirect the avatar file input through the crop flow**

Find (line 389-390):

```tsx
                <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }}/>
```

Replace with:

```tsx
                <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openCrop("avatar", f) }}/>
```

- [ ] **Step 5: Redirect the payslip-photo file input through the crop flow**

Find (line 780-781):

```tsx
                  <input ref={profPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleProfPhotoUpload(f); e.target.value = "" }} />
```

Replace with:

```tsx
                  <input ref={profPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openCrop("passport", f) }} />
```

- [ ] **Step 6: Render the modal**

Find (line 868, the comment marking the next modal in the file):

```tsx
      {/* ── Change Password Modal ──────────────────────────────────────────── */}
```

Insert immediately before it:

```tsx
      <PhotoCropModal
        open={cropTarget !== null}
        imageSrc={cropImageSrc}
        onCancel={closeCrop}
        onConfirm={handleCropConfirm}
      />

      {/* ── Change Password Modal ──────────────────────────────────────────── */}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: passes with no errors.

- [ ] **Step 8: Manual verification**

Run: `pnpm dev`, sign in as a MEMBER, go to `/member/profile`.
- Click the small camera button on the avatar → pick an image → the crop modal opens showing that image in a circular mask, not the old raw upload.
- Drag to reposition, move the zoom slider → the preview updates live.
- Click **Save Photo** → modal closes, avatar updates to the cropped image (same as before, just now cropped first).
- Repeat for the "Professional Photo" upload button under **My Payslip** → same modal, updates `profPhotoUrl`.
- Click **Cancel** in the modal at least once → modal closes, no upload happens, no error shown.

- [ ] **Step 9: Commit**

```bash
git add app/member/profile/profile-client.tsx
git commit -m "feat(profile): crop avatar and payslip photo before upload"
```

---

### Task 5: Wire the crop modal into the Admin Team edit-member flow

**Files:**
- Modify: `app/admin/team/team-client.tsx`

**Interfaces:**
- Consumes: `PhotoCropModal` from `@/components/ui/PhotoCropModal` (Task 3).
- Consumes (unchanged, already exist in `MemberSheet`): `photoFile`/`setPhotoFile`, `photoPreview`/`setPhotoPreview` state (line 317-318); `uploadPassportPhoto` Server Action call inside `handleSubmit` (line 368-376), which reads `photoFile` — untouched.

- [ ] **Step 1: Import the modal**

In `app/admin/team/team-client.tsx`, add to the top imports (after the `addPosition...` import, line 22):

```ts
import { PhotoCropModal } from "@/components/ui/PhotoCropModal"
```

- [ ] **Step 2: Add crop-flow state and replace `handlePhotoSelect`**

Find (line 317-325):

```ts
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile]       = useState<File | null>(null)

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }
```

Replace with:

```ts
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile]       = useState<File | null>(null)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setCropImageSrc(URL.createObjectURL(file))
  }
  function closeCrop() {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc)
    setCropImageSrc(null)
  }
  function handleCropConfirm(blob: Blob) {
    closeCrop()
    const file = new File([blob], "passport-photo.jpg", { type: "image/jpeg" })
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }
```

- [ ] **Step 3: Render the modal**

Find (line 919-921, the end of `MemberSheet`'s returned JSX):

```tsx
        )}
      </div>
    </>
  )
}
```

Replace with:

```tsx
        )}
      </div>
      <PhotoCropModal
        open={cropImageSrc !== null}
        imageSrc={cropImageSrc}
        onCancel={closeCrop}
        onConfirm={handleCropConfirm}
      />
    </>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: passes with no errors.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, sign in as an ADMIN, go to `/admin/team`, click **Edit** on any member.
- Click **Change Photo** / **Upload Photo** on the Passport Photo field → pick an image → the crop modal opens (same modal as Task 4, circular mask).
- Save the crop → the 64×80 preview thumbnail in the edit form updates to the cropped image, and the "✓ New photo selected — will upload on save" note appears (existing behavior, driven by `photoFile` being set — unchanged).
- Click **Save Changes** → confirm no console errors and the member's passport photo updates (check the Team roster row's circular photo, and/or generate that member's payslip to confirm the photo renders well-framed).
- Click **Cancel** in the crop modal at least once → modal closes, `photoFile`/`photoPreview` stay unchanged, no upload happens.

- [ ] **Step 6: Commit**

```bash
git add app/admin/team/team-client.tsx
git commit -m "feat(admin): crop passport photo before upload in Team edit"
```

---

### Task 6: Mobile/desktop QA pass across all three integration points

This project requires desktop and mobile to be verified in sync for any UI change (per project convention — mobile-first, both must work). This task is manual verification, not code.

**Files:** none (verification only).

- [ ] **Step 1: Desktop pass**

With `pnpm dev` running at a normal desktop browser width (≥1024px):
- Repeat Task 4 Step 8 (member avatar + payslip photo) and Task 5 Step 5 (admin passport photo).
- Confirm the crop modal is centered, max-width ~420px, doesn't overflow the viewport, and mouse-drag + scroll-to-zoom both work inside the crop area.

- [ ] **Step 2: Mobile pass**

Using browser devtools device emulation at 360px width (or a real phone against the dev server):
- Repeat the same three upload flows.
- Confirm the crop modal fits within the viewport with no horizontal scroll, the zoom slider and Cancel/Save buttons are reachable and not cut off, and touch drag + pinch-to-zoom work inside the crop area.

- [ ] **Step 3: Note any issues found**

If either pass surfaces a layout problem, fix it directly in `components/ui/PhotoCropModal.tsx` (adjust the fixed `height: 320` crop container or modal `maxWidth` for small viewports) and re-run both passes before moving on. Do not commit broken responsive behavior.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add components/ui/PhotoCropModal.tsx
git commit -m "fix: adjust photo-crop modal for mobile viewports"
```

(Skip this commit if Steps 1-2 passed with no changes needed.)
