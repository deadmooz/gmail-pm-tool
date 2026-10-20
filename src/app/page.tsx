import Link from "next/link"

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Link href="/bugs" className="rounded-xl border bg-white text-slate-950 shadow-sm p-6 hover:border-slate-400">
          <h3 className="text-sm font-medium text-slate-500">Bugs</h3>
          <p className="mt-2 text-sm text-slate-700">View open bugs from your Jira workspace.</p>
        </Link>
        <Link href="/features" className="rounded-xl border bg-white text-slate-950 shadow-sm p-6 hover:border-slate-400">
          <h3 className="text-sm font-medium text-slate-500">Tasks &amp; Features</h3>
          <p className="mt-2 text-sm text-slate-700">View tasks and feature requests from Jira.</p>
        </Link>
      </div>

      <div className="rounded-xl border bg-white text-slate-950 shadow-sm p-6 flex items-center justify-center">
        <p className="text-slate-500">
          Configure your Jira connection in <Link href="/settings" className="underline">Settings</Link> to get started.
        </p>
      </div>
    </div>
  )
}
