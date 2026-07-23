"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getCompanyId() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  const admin = adminClient()
  const { data } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!data) throw new Error("No profile")
  return { companyId: data.company_id as string, userId: user.id }
}

export async function upsertTravelCost(
  clientName: string,
  date: string,
  shootTitle: string,
  amount: number,
) {
  const { companyId, userId } = await getCompanyId()
  const admin = adminClient()

  if (amount <= 0) {
    // delete if zero
    await admin.from("client_expenses").delete().match({
      company_id: companyId,
      client_name: clientName,
      date,
      type: "travel",
      shoot_title: shootTitle,
    })
  } else {
    await admin.from("client_expenses").upsert(
      {
        company_id: companyId,
        client_name: clientName,
        date,
        type: "travel",
        shoot_title: shootTitle,
        amount,
        added_by: userId,
      },
      { onConflict: "company_id,date,client_name,type,shoot_title" }
    )
  }
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
}

export async function addClientExpense(data: {
  clientName: string
  date: string
  type: "ad" | "software" | "other"
  amount: number
  notes?: string
}) {
  const { companyId, userId } = await getCompanyId()
  const admin = adminClient()

  await admin.from("client_expenses").insert({
    company_id: companyId,
    client_name: data.clientName,
    date: data.date,
    type: data.type,
    amount: data.amount,
    notes: data.notes ?? null,
    shoot_title: null,
    added_by: userId,
  })
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
}

export async function updateClientExpense(id: string, data: {
  clientName: string
  date: string
  type: "ad" | "software" | "other"
  amount: number
  notes?: string
}) {
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  await admin.from("client_expenses").update({
    client_name: data.clientName,
    date: data.date,
    type: data.type,
    amount: data.amount,
    notes: data.notes ?? null,
  }).match({ id, company_id: companyId })
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
}

export async function deleteClientExpense(id: string) {
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  await admin.from("client_expenses").delete().match({ id, company_id: companyId })
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
}

export async function upsertCommonExpense(data: {
  id?: string
  name: string
  type: "rent" | "software" | "other"
  month: string
  amount: number
  notes?: string
}) {
  const { companyId } = await getCompanyId()
  const admin = adminClient()

  if (data.id) {
    await admin.from("common_expenses").update({
      name: data.name,
      type: data.type,
      month: data.month,
      amount: data.amount,
      notes: data.notes ?? null,
    }).match({ id: data.id, company_id: companyId })
  } else {
    await admin.from("common_expenses").insert({
      company_id: companyId,
      name: data.name,
      type: data.type,
      month: data.month,
      amount: data.amount,
      notes: data.notes ?? null,
    })
  }
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
}

export async function deleteCommonExpense(id: string) {
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  await admin.from("common_expenses").delete().match({ id, company_id: companyId })
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
}

// ── Copy expenses to another month ──────────────────────────────────────────
// Always copies FROM the month currently being viewed (the client already has
// that month's rows loaded, so there's nothing to fetch here) INTO a picked
// target month. Every field is editable in the picker before confirming, since
// nothing reliably repeats identically month to month — no duplicate-detection
// on purpose, the admin already knows what's been re-entered by hand.
// The `id` list is still checked against company_id server-side (a client could
// otherwise pass an id belonging to a different tenant); everything else in the
// payload is trusted, since it's just the initial values for a brand-new row the
// admin already reviewed and edited in the drawer.

export async function copyCommonExpensesToMonth(
  items: { id: string; name: string; notes: string | null; amount: number }[],
  targetMonth: string
) {
  if (!items.length) return { success: false, error: "Nothing selected" }
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  const { data: owned, error: fetchError } = await admin
    .from("common_expenses")
    .select("id")
    .eq("company_id", companyId)
    .in("id", items.map(i => i.id))
  if (fetchError) return { success: false, error: fetchError.message }
  const ownedIds = new Set((owned ?? []).map(r => r.id))
  const valid = items.filter(i => ownedIds.has(i.id))
  if (!valid.length) return { success: false, error: "Nothing selected" }

  const { error } = await admin.from("common_expenses").insert(
    valid.map(i => ({
      company_id: companyId, name: i.name, type: "other", amount: i.amount, notes: i.notes, month: targetMonth,
    }))
  )
  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
  return { success: true, count: valid.length }
}

export async function copyClientExpensesToMonth(
  items: { id: string; clientName: string; date: string; type: string; notes: string | null; amount: number }[],
  targetMonth: string
) {
  if (!items.length) return { success: false, error: "Nothing selected" }
  const { companyId, userId } = await getCompanyId()
  const admin = adminClient()
  const { data: owned, error: fetchError } = await admin
    .from("client_expenses")
    .select("id")
    .eq("company_id", companyId)
    .in("id", items.map(i => i.id))
  if (fetchError) return { success: false, error: fetchError.message }
  const ownedIds = new Set((owned ?? []).map(r => r.id))
  const valid = items.filter(i => ownedIds.has(i.id))
  if (!valid.length) return { success: false, error: "Nothing selected" }

  const [ty, tm] = targetMonth.split("-").map(Number)
  const lastDayOfTarget = new Date(ty, tm, 0).getDate()

  const { error } = await admin.from("client_expenses").insert(
    valid.map(i => {
      // Same day-of-month as the source row (e.g. charged on the 17th every
      // month), clamped if the target month is shorter (31st -> 30th, etc.)
      const sourceDay = Number(i.date.split("-")[2])
      const day = Math.min(sourceDay, lastDayOfTarget)
      return {
        company_id: companyId,
        client_name: i.clientName,
        date: `${targetMonth}-${String(day).padStart(2, "0")}`,
        type: i.type,
        amount: i.amount,
        notes: i.notes,
        shoot_title: null,
        added_by: userId,
      }
    })
  )
  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
  return { success: true, count: valid.length }
}
