# Photo Upload — Crop Step — Design

**Date:** 2026-07-26
**Status:** Approved
**Area:** Member Profile, Admin → Team

---

## Problem

Every photo upload in the app today accepts whatever file the user picks and uploads
it as-is via `/api/upload-photo`. There is no framing/crop step, so photos land
off-center, at the wrong aspect ratio, or with too much surrounding background —
most visibly on the payslip PDF, where `passport_photo_url` is rendered as a 90×90
circle with `object-position: top center` (a hint the design already assumes a
tightly-framed headshot that today's raw uploads rarely deliver).

## Goal

Add a crop step between "user picks a file" and "file gets uploaded," for the two
photo fields that are displayed as avatars app-wide:

- `photo_url` — the member's own profile avatar
- `passport_photo_url` — the "payslip photo," which renders as a circle in three
  places: the payslip PDF (`app/api/payslip/route.ts`), the admin Team roster row,
  and (as a small rectangular edit-preview only) the admin Team edit modal

Both fields are circular in every real display context, so both use the same crop
shape: a **1:1 circular crop**, not two different aspect ratios.

## Scope — three upload points

1. **Member Profile page** (`app/member/profile/profile-client.tsx`)
   - `handlePhotoUpload` — avatar (`photo_url`)
   - `handleProfPhotoUpload` — payslip photo (`passport_photo_url`)
2. **Admin → Team → Edit member** (`app/admin/team/team-client.tsx`)
   - `handlePhotoSelect` — same `passport_photo_url` field; this is where admins
     upload on a member's behalf, and the most common source of a badly-framed
     payslip photo since the member never sees or approves it

Out of scope: the preset-avatar picker (`handlePresetPick` — no file to crop), and
KYC document uploads (Aadhaar/PAN/ration card — these are ID documents, not
headshots, and must stay unmodified/uncropped for legal legibility).

---

## Architecture

**`lib/image/crop.ts`** — pure utility, no framework dependency:

```ts
getCroppedImageBlob(
  imageSrc: string,
  cropPixels: { x: number; y: number; width: number; height: number },
  outputSize: number, // 512
): Promise<Blob>
```

Draws the selected region onto an off-screen `<canvas>` sized `outputSize ×
outputSize`, exports as JPEG at quality 0.9. Unit-testable with a mocked canvas.

**`components/ui/photo-crop-modal.tsx`** — shared modal, used identically in all
three call sites:

```ts
type PhotoCropModalProps = {
  open: boolean
  imageSrc: string | null       // object URL of the just-picked file
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}
```

Built on `react-easy-crop` (new dependency — headless interaction library, no
styled components, same category as the already-used `@dnd-kit`). Fixed `aspect={1}`,
`cropShape="round"`. Styled to match the existing design system: rounded corners,
brand red accents, `focus-visible` rings on both buttons. Full-screen overlay below
the `md` breakpoint, centered ~420px dialog above it — consistent with existing
modal responsive behavior elsewhere in the app. Pinch-to-zoom and drag work via
`react-easy-crop` out of the box on touch; desktop gets scroll-to-zoom + drag, plus
a zoom slider for accessibility/mouse-only use.

## Flow (identical at all three call sites)

1. User picks a file via the existing `<input type="file">` — unchanged.
2. `PhotoCropModal` opens immediately with `URL.createObjectURL(file)` — no
   pre-crop size gate; cropping happens before any size check is meaningful,
   since the output is fixed-size regardless of the original.
3. User frames the shot, clicks **Save Photo** (or **Cancel**, which closes the
   modal and uploads nothing — same as picking-the-wrong-file-and-not-uploading
   today).
4. `getCroppedImageBlob` returns a 512×512 JPEG Blob (reliably tens of KB).
5. That Blob replaces the raw `File` in the existing upload call. The two
   member-profile handlers still call `/api/upload-photo` (`app/api/upload-photo/route.ts`,
   `documents` bucket) — unchanged, it already reads whatever's under `"file"`
   in the FormData. The admin Team upload calls a **different** existing
   mechanism, the `uploadPassportPhoto` Server Action (`lib/actions/team.ts:497`,
   `passport-photos` bucket) — also unchanged, it likewise just does
   `formData.get('file')`. Both are compatible with receiving a Blob instead of
   a File with no changes on their end.

`uploadPassportPhoto` already enforces a server-side 2MB cap
(`lib/actions/team.ts:512`) on whatever it receives — since the cropped Blob is
always ~tens of KB, this cap is now effectively unreachable in practice, but it
stays as-is (defense in depth, not worth removing). The member-profile handlers'
client-side 4MB check on `handleProfPhotoUpload` currently runs *before* upload;
it becomes dead code once cropping always produces a small Blob, but removing
it is optional cleanup, not required for this feature to work.

## Error handling

- Crop/canvas failure (corrupt image, browser canvas exception) surfaces the same
  "Upload failed" error state each of the three flows already has; modal closes,
  nothing uploads, user can retry from file-picking.
- Network/upload failure after a successful crop uses each flow's existing error
  handling — unchanged, since the upload call itself is unchanged.

## Testing

- Unit test `getCroppedImageBlob` in Vitest with a mocked canvas context —
  verify it produces a blob of the requested output size for a given crop-pixel
  input.
- Manual QA at 360px (mobile) and desktop widths for all three integration
  points, since this touches both member-facing and admin-facing surfaces —
  per the project's mobile/desktop parity requirement.

## Non-goals

- No server-side image processing — cropping is entirely client-side, matching
  the existing "upload whatever the client sends" backend design.
- No change to KYC document upload flows.
- No change to the preset-avatar picker.
- No aspect-ratio option other than 1:1 circular — both photo fields render as
  circles everywhere that matters today.
