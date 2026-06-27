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
