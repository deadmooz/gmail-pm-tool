"use client"

import Link from "next/link"
import {
  AlertCircle,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Equal,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApiError } from "@/lib/api-client"
import { priorityRank, PROJECTS, type IssueSummary, type Person, type StatusCategory } from "@/lib/jira-types"

/* ----------------------------------------------------------------- formatting */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso)
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(iso.length === 10 ? { timeZone: "UTC" } : {}),
  })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days}d ago` : fmtDate(iso)
}

/* ------------------------------------------------------------------ elements */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-slate-400", className)} />
}

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
]

export function Avatar({ person, size = "sm" }: { person: Person | null; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"
  if (!person) {
    return (
      <span
        title="Unassigned"
        className={cn(dims, "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400")}
      >
        ?
      </span>
    )
  }
  const initials = person.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
  const hash = [...person.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)
  return (
    <span
      title={person.name}
      className={cn(dims, AVATAR_COLORS[hash % AVATAR_COLORS.length], "inline-flex shrink-0 items-center justify-center rounded-full font-semibold")}
    >
      {initials}
    </span>
  )
}

const TYPE_STYLE: Record<string, string> = {
  bug: "bg-red-500",
  task: "bg-sky-500",
  "ad hoc task": "bg-cyan-600",
  story: "bg-emerald-500",
  epic: "bg-violet-500",
  "sub-task": "bg-sky-300",
  subtask: "bg-sky-300",
}

export function TypeIcon({ type }: { type: string }) {
  return (
    <span
      title={type}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold text-white",
        TYPE_STYLE[type.toLowerCase()] ?? "bg-slate-400"
      )}
    >
      {type[0]?.toUpperCase()}
    </span>
  )
}

export function PriorityIcon({ priority }: { priority: string | null }) {
  if (!priority) return null
  const rank = priorityRank(priority)
  const props = { className: "h-4 w-4 shrink-0", "aria-label": priority }
  let icon
  if (rank === 0) icon = <ChevronsUp {...props} className={cn(props.className, "text-red-600")} />
  else if (rank === 1) icon = <ChevronUp {...props} className={cn(props.className, "text-orange-500")} />
  else if (rank === 3) icon = <ChevronDown {...props} className={cn(props.className, "text-sky-600")} />
  else if (rank === 4) icon = <ChevronsDown {...props} className={cn(props.className, "text-sky-400")} />
  else icon = <Equal {...props} className={cn(props.className, "text-amber-500")} />
  return <span title={priority ?? undefined}>{icon}</span>
}

const STATUS_STYLE: Record<StatusCategory, string> = {
  todo: "bg-slate-100 text-slate-700",
  inprogress: "bg-sky-100 text-sky-800",
  done: "bg-emerald-100 text-emerald-800",
}

export function StatusPill({ status, category }: { status: string; category: StatusCategory }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap", STATUS_STYLE[category])}>
      {status}
    </span>
  )
}

/* ------------------------------------------------------------------- layout */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            o.value === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export type ProjectFilter = "all" | (typeof PROJECTS)[number]

export function ProjectTabs({ value, onChange }: { value: ProjectFilter; onChange: (v: ProjectFilter) => void }) {
  return (
    <Segmented<ProjectFilter>
      value={value}
      onChange={onChange}
      options={[{ value: "all", label: "All projects" }, ...PROJECTS.map((p) => ({ value: p, label: p }))]}
    />
  )
}

/** Distinct people from a list of issues, sorted by name. */
export function peopleOf(issues: IssueSummary[], pick: (issue: IssueSummary) => Person | null): Person[] {
  const map = new Map<string, Person>()
  issues.forEach((i) => {
    const p = pick(i)
    if (p) map.set(p.id, p)
  })
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** "" = everyone, "none" = field empty, otherwise a person id. */
export function matchesPerson(person: Person | null, filter: string): boolean {
  if (!filter) return true
  return filter === "none" ? !person : person?.id === filter
}

export function PersonSelect({
  label,
  emptyLabel,
  people,
  value,
  onChange,
  className,
}: {
  label: string
  emptyLabel: string
  people: Person[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, className)} aria-label={label}>
      <option value="">All {label.toLowerCase()}s</option>
      <option value="none">{emptyLabel}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}

export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
      Refresh
    </button>
  )
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  const code = "code" in error ? error.code : undefined
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-2">
        <p>{error.message}</p>
        <div className="flex gap-3">
          {(code === "NO_KEY" || code === "JIRA_AUTH") && (
            <Link href="/settings" className="font-semibold underline">Go to My Settings</Link>
          )}
          {code === "NO_DOMAIN" && <Link href="/admin" className="font-semibold underline">Go to Admin</Link>}
          {onRetry && !code?.startsWith("NO_") && (
            <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>
}

export function StatTile({
  label,
  value,
  foot,
  tone,
}: {
  label: string
  value: string | number
  foot: string
  tone?: "alert" | "warn" | "good"
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tabular-nums",
          tone === "alert" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{foot}</p>
    </Card>
  )
}

export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
