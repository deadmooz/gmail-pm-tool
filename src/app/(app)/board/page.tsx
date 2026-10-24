"use client"

import { useMemo, useState } from "react"
import { useIssues } from "@/hooks/useIssues"
import { useBoards } from "@/hooks/useBoards"
import { useTeam } from "@/hooks/useTeam"
import {
  daysOverdue,
  PROJECTS,
  STATUS_CATEGORY_ORDER,
  type BoardConfig,
  type IssueSummary,
  type ProjectKey,
  type StatusCategory,
} from "@/lib/jira-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import {
  Avatar,
  ErrorBox,
  fmtDate,
  inputClass,
  matchesPerson,
  PageHeader,
  peopleOf,
  PersonSelect,
  PriorityIcon,
  ProjectTabs,
  RefreshButton,
  Segmented,
  Spinner,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type BoardScope = "sprint" | "next" | "open"

interface Column {
  id: string
  name: string
  category: StatusCategory
  issues: IssueSummary[]
}

const COLUMN_TINT: Record<StatusCategory, string> = {
  todo: "border-t-slate-300",
  inprogress: "border-t-sky-400",
  done: "border-t-emerald-400",
}

/**
 * Lays issues out in the Jira board's own columns. For "all projects" the three
 * boards are merged: columns that share any status are the same column (the
 * boards name a few of them differently), ordered by their average position.
 */
function buildColumns(issues: IssueSummary[], boards: Record<string, BoardConfig | null>, project: ProjectFilter): Column[] | null {
  const projects = project === "all" ? [...PROJECTS] : [project]
  const configs = projects.map((p) => [p, boards[p]] as const).filter((e): e is readonly [ProjectKey, BoardConfig] => !!e[1])
  if (!configs.length) return null

  interface Merged {
    names: string[]
    positions: number[]
    statusIds: Set<string>
  }
  const merged: Merged[] = []
  // Per project: board column index -> merged column, so each card lands in the right place.
  const lookup = new Map<string, Merged>()

  for (const [p, board] of configs) {
    board.columns.forEach((c, i) => {
      // Join the existing column sharing the most statuses (a status can sit in different columns on different boards).
      let target: Merged | undefined
      let best = 0
      for (const m of merged) {
        const shared = c.statusIds.filter((id) => m.statusIds.has(id)).length
        if (shared > best) {
          best = shared
          target = m
        }
      }
      if (!target) {
        target = { names: [], positions: [], statusIds: new Set() }
        merged.push(target)
      }
      target.names.push(c.name)
      target.positions.push(i / Math.max(1, board.columns.length - 1))
      c.statusIds.forEach((id) => {
        target!.statusIds.add(id)
        lookup.set(`${p}|${id}`, target!)
      })
    })
  }

  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  // The name most boards use, ignoring cut-off variants ("…Feasibilit" when "…Feasibility" exists).
  const label = (names: string[]) => {
    const lower = (n: string) => n.toLowerCase()
    const full = [...new Set(names)].filter((n) => !names.some((m) => m.length > n.length && lower(m).startsWith(lower(n))))
    const count = (n: string) => names.filter((x) => lower(x) === lower(n)).length
    return full.sort((a, b) => count(b) - count(a) || b.length - a.length)[0]
  }

  const ordered = merged.sort((a, b) => avg(a.positions) - avg(b.positions))
  const columns = new Map<Merged, Column>(
    ordered.map((m, i) => [m, { id: `col-${i}`, name: label(m.names), category: "todo" as StatusCategory, issues: [] }])
  )
  const other: Column = { id: "__other", name: "Not on the board", category: "todo", issues: [] }

  for (const issue of issues) {
    const m = lookup.get(`${issue.project}|${issue.statusId}`)
    ;(m ? columns.get(m)! : other).issues.push(issue)
  }

  const result = [...columns.values(), other]
  // A column's colour follows the most advanced status category among its cards.
  result.forEach((c) => {
    c.category = c.issues.reduce<StatusCategory>(
      (best, i) =>
        STATUS_CATEGORY_ORDER.indexOf(i.statusCategory) > STATUS_CATEGORY_ORDER.indexOf(best) ? i.statusCategory : best,
      "todo"
    )
  })
  return result
}

/** Fallback when board layouts can't be read: one column per status, grouped To Do → Done. */
function statusColumns(issues: IssueSummary[]): Column[] {
  const map = new Map<string, Column>()
  issues.forEach((i) => {
    const col = map.get(i.status) ?? { id: i.status, name: i.status, category: i.statusCategory, issues: [] }
    col.issues.push(i)
    map.set(i.status, col)
  })
  return [...map.values()].sort(
    (a, b) =>
      STATUS_CATEGORY_ORDER.indexOf(a.category) - STATUS_CATEGORY_ORDER.indexOf(b.category) ||
      a.name.localeCompare(b.name)
  )
}

export default function BoardPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [scope, setScope] = useState<BoardScope>("sprint")
  const { issues, error, loading, firstLoad, reload } = useIssues(project, scope)
  const boards = useBoards()
  const team = useTeam()

  const [query, setQuery] = useState("")
  const [assignee, setAssignee] = useState("")
  const [owner, setOwner] = useState("")
  const [type, setType] = useState("")
  const [hideEmpty, setHideEmpty] = useState(true)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const assignees = useMemo(() => peopleOf(issues, (i) => i.assignee), [issues])
  const owners = useMemo(() => peopleOf(issues, (i) => i.productOwner), [issues])
  const types = useMemo(() => [...new Set(issues.map((i) => i.type))].sort(), [issues])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return issues.filter(
      (i) =>
        (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) &&
        matchesPerson(i.assignee, assignee) &&
        matchesPerson(i.productOwner, owner) &&
        (!type || i.type === type)
    )
  }, [issues, query, assignee, owner, type])

  const columns = useMemo(() => {
    const cols = (boards && buildColumns(visible, boards, project)) ?? statusColumns(visible)
    return hideEmpty ? cols.filter((c) => c.issues.length) : cols.filter((c) => c.id !== "__other" || c.issues.length)
  }, [visible, boards, project, hideEmpty])

  const filtersOn = Boolean(query || assignee || owner || type)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Board"
        description="Your Jira board columns, read-only. Click a card for details; make changes in Jira."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectTabs value={project} onChange={setProject} />
        <Segmented<BoardScope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "sprint", label: "Current sprint" },
            { value: "next", label: "Next sprint" },
            { value: "open", label: "All open" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search key or summary…"
          className={cn(inputClass, "w-64")}
        />
        <PersonSelect label="Product Owner" emptyLabel="No Product Owner" people={owners} value={owner} onChange={setOwner} className="w-52" />
        <PersonSelect label="Assignee" emptyLabel="Unassigned" people={assignees} value={assignee} onChange={setAssignee} className="w-48" />
        <select value={type} onChange={(e) => setType(e.target.value)} className={cn(inputClass, "w-40")} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setAssignee("")
              setOwner("")
              setType("")
            }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Clear filters
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
          Hide empty columns
        </label>
        <span className="text-sm text-slate-500">
          {visible.length} {filtersOn ? `of ${issues.length} ` : ""}issue{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading issues from Jira…
        </div>
      )}

      {!error && !firstLoad && issues.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {scope === "sprint" ? "No issues in an active sprint." : scope === "next" ? "Nothing planned for the next sprint yet." : "No open issues."}
        </div>
      )}

      {!error && !firstLoad && issues.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <section key={col.id} className={cn("flex w-72 shrink-0 flex-col rounded-xl border-t-4 bg-slate-100/80", COLUMN_TINT[col.category])}>
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{col.name}</h2>
                <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500">{col.issues.length}</span>
              </header>
              <div className="flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2">
                {col.issues.map((issue) => (
                  <BoardCard key={issue.key} issue={issue} onOpen={() => setOpenKey(issue.key)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} team={team.team} onTeamChanged={team.reload} />
    </div>
  )
}

function BoardCard({ issue, onOpen }: { issue: IssueSummary; onOpen: () => void }) {
  const overdue = daysOverdue(issue)
  const late = overdue !== null && overdue > 0
  const deploy = issue.delivery.deployment
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-400"
    >
      <p className="line-clamp-3 text-sm text-slate-900">{issue.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {late && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">{overdue}d past deployment</span>}
        {deploy && !late && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Deploy {fmtDate(deploy)}</span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TypeIcon type={issue.type} />
          <span className="text-xs font-medium text-slate-500">{issue.key}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          <Avatar person={issue.assignee} />
        </div>
      </div>
    </button>
  )
}
