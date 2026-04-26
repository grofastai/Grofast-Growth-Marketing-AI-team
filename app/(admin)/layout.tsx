import Sidebar from "@/components/admin/sidebar"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <main className="flex-1 ml-[260px] min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
