import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

export async function Header() {
  const session = await getServerSession(authOptions)

  return (
    <header className="bg-white shadow-sm h-16 flex items-center justify-between px-8 border-b">
      <div className="flex-1" />
      <div className="flex items-center space-x-4">
        <span className="text-sm font-medium text-slate-700">{session?.user?.name}</span>
        <div className="h-8 w-8 rounded-full bg-slate-200" />
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- NextAuth route handler, not a page */}
        <a href="/api/auth/signout" className="text-sm font-medium text-slate-500 hover:text-slate-900">
          Sign out
        </a>
      </div>
    </header>
  )
}
