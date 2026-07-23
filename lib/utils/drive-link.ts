// Shared by both client-side modals and their server actions — a link is only accepted
// if it actually points at Google Drive/Docs, not just any URL pasted into the field.
const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com']

export function isValidDriveLink(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  return DRIVE_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
}
