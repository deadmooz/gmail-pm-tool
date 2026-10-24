"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  CalendarClock,
  ClipboardCheck,
  Columns3,
  GanttChart,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Deployments", href: "/deployments", icon: CalendarClock },
  { name: "People & Capacity", href: "/people", icon: Users },
  { name: "Timeline", href: "/timeline", icon: GanttChart },
  { name: "Board", href: "/board", icon: Columns3 },
  { name: "Backlog", href: "/backlog", icon: ListTodo },
  { name: "Data checklist", href: "/checklist", icon: ClipboardCheck },
  { name: "Team setup", href: "/team", icon: UsersRound },
  { name: "My Settings", href: "/settings", icon: Settings },
]

export function Sidebar({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname()
  const items = user.role === "admin" ? [...NAV, { name: "Admin", href: "/admin", icon: ShieldCheck }] : NAV

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center px-6">
        <span className="text-lg font-bold tracking-tight text-white">PM Board</span>
        <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">IGD · ISR · IC</span>
      </div>
      <div className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                active ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </div>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-slate-400">
          {user.email} · {user.role === "admin" ? "Admin" : "Member"}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  )
}
