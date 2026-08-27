"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getValidImpersonationId } from "@/lib/impersonation"

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

/** Resolves the effective user ID for member-scoped data/actions.
 *  When the logged-in user is an ADMIN with an active impersonation cookie,
 *  returns the impersonated member's ID (same-company only). Otherwise returns
 *  the logged-in user's own ID. Returns null when there is no session.
 *
 *  The admin-role + same-company checks live in getValidImpersonationId, which is
 *  the single place allowed to read this cookie. A raw getter used to sit next to
 *  this one and was the easy, wrong thing to reach for — hence the lint ban. */
export async function getEffectiveUserId(): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  return (await getValidImpersonationId(user.id)) ?? user.id
}
