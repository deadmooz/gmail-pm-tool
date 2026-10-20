import Link from "next/link"
import { Bug, LayoutDashboard, Settings, ListPlus } from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Bugs", href: "/bugs", icon: Bug },
  { name: "Feature Requests", href: "/features", icon: ListPlus },
  { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar() {
  return (
    <div className="flex h-full w-64 flex-col bg-slate-900">
      <div className="flex h-16 shrink-0 items-center px-6">
        <span className="text-xl font-bold text-white tracking-tight">PM Intelligence</span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-4 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="group flex items-center rounded-md px-2 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0 text-slate-400 group-hover:text-white" />
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
