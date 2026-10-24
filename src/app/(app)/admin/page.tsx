import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { AdminPanel } from "@/components/AdminPanel"

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (user?.role !== "admin") redirect("/")
  return <AdminPanel currentUserId={user.id} />
}
