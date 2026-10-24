import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/Sidebar";

// Every page in this group needs a signed-in, active user.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role }} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
