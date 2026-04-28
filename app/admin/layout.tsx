import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import Sidebar from "@/components/admin/sidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "ADMIN") redirect("/member/dashboard")

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="flex-1 ml-[240px] min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
