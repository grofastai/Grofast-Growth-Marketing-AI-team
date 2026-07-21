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
// Recurring items (rent, subscriptions) repeat almost every month, but amounts
// aren't always identical (fuel, filing fees) — this only ever copies the row
// as a starting point; the admin edits it afterward the same way any other row
// gets edited. No duplicate-detection here on purpose: the admin already knows
// what's been re-entered by hand and asked to handle that themselves.

export async function getCommonExpensesForMonth(month: string) {
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  const { data } = await admin
    .from("common_expenses")
    .select("id, name, type, amount, notes")
    .eq("company_id", companyId)
    .eq("month", month)
    .order("name")
  return (data ?? []) as { id: string; name: string; type: string; amount: number; notes: string | null }[]
}

export async function copyCommonExpensesToMonth(ids: string[], targetMonth: string) {
  if (!ids.length) return { success: false, error: "Nothing selected" }
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  const { data: rows, error: fetchError } = await admin
    .from("common_expenses")
    .select("name, type, amount, notes")
    .eq("company_id", companyId)
    .in("id", ids)
  if (fetchError) return { success: false, error: fetchError.message }
  if (!rows?.length) return { success: false, error: "Nothing selected" }

  const { error } = await admin.from("common_expenses").insert(
    rows.map(r => ({
      company_id: companyId, name: r.name, type: r.type, amount: r.amount, notes: r.notes, month: targetMonth,
    }))
  )
  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
  return { success: true, count: rows.length }
}

export async function getClientExpensesForMonth(month: string) {
  const { companyId } = await getCompanyId()
  const admin = adminClient()
  const [y, m] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const monthEnd = new Date(y, m, 0).toISOString().split("T")[0]
  const { data } = await admin
    .from("client_expenses")
    .select("id, client_name, date, type, amount, notes, shoot_title")
    .eq("company_id", companyId)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: false })
  return (data ?? []) as { id: string; client_name: string; date: string; type: string; amount: number; notes: string | null; shoot_title: string | null }[]
}

export async function copyClientExpensesToMonth(ids: string[], targetMonth: string) {
  if (!ids.length) return { success: false, error: "Nothing selected" }
  const { companyId, userId } = await getCompanyId()
  const admin = adminClient()
  const { data: rows, error: fetchError } = await admin
    .from("client_expenses")
    .select("client_name, date, type, amount, notes, shoot_title")
    .eq("company_id", companyId)
    .in("id", ids)
  if (fetchError) return { success: false, error: fetchError.message }
  if (!rows?.length) return { success: false, error: "Nothing selected" }

  const [ty, tm] = targetMonth.split("-").map(Number)
  const lastDayOfTarget = new Date(ty, tm, 0).getDate()

  const { error } = await admin.from("client_expenses").insert(
    rows.map(r => {
      // Same day-of-month as the source row (e.g. charged on the 17th every
      // month), clamped if the target month is shorter (31st -> 30th, etc.)
      const sourceDay = Number(r.date.split("-")[2])
      const day = Math.min(sourceDay, lastDayOfTarget)
      return {
        company_id: companyId,
        client_name: r.client_name,
        date: `${targetMonth}-${String(day).padStart(2, "0")}`,
        type: r.type,
        amount: r.amount,
        notes: r.notes,
        shoot_title: r.shoot_title,
        added_by: userId,
      }
    })
  )
  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/expenses")
  revalidatePath("/admin/clients")
  return { success: true, count: rows.length }
}
