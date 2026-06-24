"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const COOKIE = "gf_impersonate"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function startImpersonation(targetUserId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Verify current user is ADMIN
  const admin = adminClient()
  const { data: profile } = await admin.from("users").select("role, company_id").eq("id", user.id).single()
  if (profile?.role !== "ADMIN") throw new Error("Only admins can impersonate")

  // Verify target user belongs to same company
  const { data: target } = await admin.from("users").select("id, name, company_id").eq("id", targetUserId).single()
  if (!target || target.company_id !== profile.company_id) throw new Error("User not found")

  const cookieStore = await cookies()
  cookieStore.set(COOKIE, targetUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 2, // 2 hours
    path: "/",
    sameSite: "lax",
  })

  redirect("/member/dashboard")
}

export async function stopImpersonation() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE)
  redirect("/admin/team")
}

/** Returns the user ID to use for data queries in member pages.
 *  If an admin is impersonating, returns the target user's ID. */
export async function getImpersonatedUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE)?.value ?? null
}

/** Resolves the effective user ID for member-scoped data/actions.
 *  When the logged-in user is an ADMIN with an active impersonation cookie,
 *  returns the impersonated member's ID (same-company only). Otherwise returns
 *  the logged-in user's own ID. Returns null when there is no session.
 *
 *  The admin-role + same-company checks make this safe to honor the cookie:
 *  a non-admin cannot escalate by forging the cookie. */
export async function getEffectiveUserId(): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = adminClient()
  const { data: self } = await admin
    .from("users")
    .select("role, company_id")
    .eq("id", user.id)
    .single()

  if (self?.role === "ADMIN") {
    const impersonateId = (await cookies()).get(COOKIE)?.value
    if (impersonateId && impersonateId !== user.id) {
      const { data: target } = await admin
        .from("users")
        .select("company_id")
        .eq("id", impersonateId)
        .single()
      if (target?.company_id && target.company_id === self.company_id) {
        return impersonateId
      }
    }
  }

  return user.id
}
