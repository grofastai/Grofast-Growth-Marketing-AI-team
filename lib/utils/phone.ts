/** Normalise a phone number for duplicate comparison: digits only, last 10
 *  (so "919629609623", "+91 96296 09623" and "9629609623" all compare equal). */
export function normalizePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "").slice(-10)
}
