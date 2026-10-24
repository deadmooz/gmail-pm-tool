import { getCurrentUser } from "@/lib/session"
import { TeamSetup } from "@/components/TeamSetup"

export default async function TeamPage() {
  const user = await getCurrentUser()
  return <TeamSetup isAdmin={user?.role === "admin"} />
}
