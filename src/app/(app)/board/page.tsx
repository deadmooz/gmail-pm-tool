"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { useIssues } from "@/hooks/useIssues"
import { apiFetch, errorMessage } from "@/lib/api-client"
import {
  daysOverdue,
  STATUS_CATEGORY_ORDER,
  type IssueSummary,
  type IssueTransition,
  type StatusCategory,
} from "@/lib/jira-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import {
  Avatar,
  ErrorBox,
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

type BoardScope = "sprint" | "open"

interface Column {
  status: string
  category: StatusCategory
}

const COLUMN_TINT: Record<StatusCategory, string> = {
  todo: "border-t-slate-300",
  inprogress: "border-t-sky-400",
  done: "border-t-emerald-400",
}

export default function BoardPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [scope, setScope] = useState<BoardScope>("sprint")
  const { issues, error, loading, firstLoad, reload, patchIssue } = useIssues(project, scope)

  const [query, setQuery] = useState("")
  const [assignee, setAssignee] = useState("")
  const [owner, setOwner] = useState("")
  const [type, setType] = useState("")
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Columns come from every loaded issue (not just the filtered ones), so
  // filtering never makes a column disappear from under a card you're dragging.
  const columns = useMemo<Column[]>(() => {
    const byStatus = new Map<string, StatusCategory>()
    issues.forEach((i) => byStatus.set(i.status, i.statusCategory))
    return [...byStatus.entries()]
      .map(([status, category]) => ({ status, category }))
      .sort(
        (a, b) =>
          STATUS_CATEGORY_ORDER.indexOf(a.category) - STATUS_CATEGORY_ORDER.indexOf(b.category) ||
          a.status.localeCompare(b.status)
      )
  }, [issues])

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

  const filtersOn = Boolean(query || assignee || owner || type)

  async function moveIssue(key: string, column: Column) {
    const issue = issues.find((i) => i.key === key)
    if (!issue || issue.status === column.status) return
    const before = { status: issue.status, statusCategory: issue.statusCategory }

    setMoveError(null)
    setMoving(key)
    patchIssue(key, { status: column.status, statusCategory: column.category })
    try {
      // Jira moves issues through workflow transitions, not by setting a status
      // directly, so find the transition that lands in the target column.
      const { transitions } = await apiFetch<{ transitions: IssueTransition[] }>(`/api/issues/${key}/transitions`)
      const transition = transitions.find((t) => t.to === column.status)
      if (!transition) {
        throw new Error(`${key} can't move from "${before.status}" to "${column.status}" in its Jira workflow.`)
      }
      await apiFetch(`/api/issues/${key}/transitions`, { method: "POST", body: { transitionId: transition.id } })
    } catch (err) {
      patchIssue(key, before)
      setMoveError(errorMessage(err))
    } finally {
      setMoving(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Board"
        description="Drag a card to another column to change its status in Jira. Click a card for details."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectTabs value={project} onChange={setProject} />
        <Segmented<BoardScope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "sprint", label: "Active sprint" },
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
        <span className="ml-auto text-sm text-slate-500">
          {visible.length} {filtersOn ? `of ${issues.length} ` : ""}issue{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      {moveError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{moveError}</span>
          <button type="button" onClick={() => setMoveError(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <ErrorBox error={error} onRetry={reload} />}

      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading issues from Jira…
        </div>
      )}

      {!error && !firstLoad && issues.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {scope === "sprint"
            ? "No issues in an active sprint. Try “All open” to see everything that isn't done."
            : "No open issues."}
        </div>
      )}

      {!error && !firstLoad && issues.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const cards = visible.filter((i) => i.status === col.status)
            return (
              <section
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                  if (dropTarget !== col.status) setDropTarget(col.status)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTarget(null)
                  const key = e.dataTransfer.getData("text/plain")
                  if (key) moveIssue(key, col)
                }}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-xl border-t-4 bg-slate-100/80",
                  COLUMN_TINT[col.category],
                  dropTarget === col.status && "ring-2 ring-sky-400"
                )}
              >
                <header className="flex items-center justify-between px-3 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{col.status}</h2>
                  <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500">{cards.length}</span>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                  {cards.map((issue) => (
                    <BoardCard
                      key={issue.key}
                      issue={issue}
                      moving={moving === issue.key}
                      onOpen={() => setOpenKey(issue.key)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} onChanged={patchIssue} />
    </div>
  )
}

function BoardCard({
  issue,
  moving,
  onOpen,
}: {
  issue: IssueSummary
  moving: boolean
  onOpen: () => void
}) {
  const overdue = daysOverdue(issue)
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!moving}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", issue.key)
        e.dataTransfer.effectAllowed = "move"
      }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-400",
        moving && "opacity-60"
      )}
    >
      <p className="line-clamp-3 text-sm text-slate-900">{issue.summary}</p>
      {overdue !== null && overdue > 0 && (
        <span className="mt-2 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
          {overdue}d overdue
        </span>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TypeIcon type={issue.type} />
          <span className="text-xs font-medium text-slate-500">{issue.key}</span>
          {moving && <Spinner className="h-3 w-3" />}
        </div>
        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          <Avatar person={issue.assignee} />
        </div>
      </div>
    </div>
  )
}
