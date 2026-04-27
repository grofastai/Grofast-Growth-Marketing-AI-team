import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import Sidebar from "@/components/admin/sidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-screen" style={{ background: "#0B0F14" }}>
      <Sidebar />
      <main className="flex-1 ml-[240px] min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
