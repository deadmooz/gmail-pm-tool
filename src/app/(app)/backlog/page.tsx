"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useIssues } from "@/hooks/useIssues"
import {
  daysOverdue,
  priorityRank,
  STATUS_CATEGORY_LABEL,
  STATUS_CATEGORY_ORDER,
  type IssueScope,
  type IssueSummary,
} from "@/lib/jira-types"
import { cn } from "@/lib/utils"
import { IssueDrawer } from "@/components/IssueDrawer"
import {
  Avatar,
  Card,
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
  StatusPill,
  timeAgo,
  TypeIcon,
  type ProjectFilter,
} from "@/components/ui-kit"

type SortKey = "key" | "summary" | "status" | "priority" | "owner" | "assignee" | "due" | "updated"

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "key", label: "Key", className: "w-28" },
  { key: "summary", label: "Summary" },
  { key: "status", label: "Status", className: "w-36" },
  { key: "priority", label: "Priority", className: "w-28" },
  { key: "owner", label: "Product Owner", className: "w-44" },
  { key: "assignee", label: "Assignee", className: "w-44" },
  { key: "due", label: "Due", className: "w-24" },
  { key: "updated", label: "Updated", className: "w-24" },
]

function keyNumber(key: string) {
  return Number(key.split("-")[1]) || 0
}

function compare(a: IssueSummary, b: IssueSummary, sort: SortKey): number {
  switch (sort) {
    case "key":
      return a.project.localeCompare(b.project) || keyNumber(a.key) - keyNumber(b.key)
    case "summary":
      return a.summary.localeCompare(b.summary)
    case "status":
      return (
        STATUS_CATEGORY_ORDER.indexOf(a.statusCategory) - STATUS_CATEGORY_ORDER.indexOf(b.statusCategory) ||
        a.status.localeCompare(b.status)
      )
    case "priority":
      return priorityRank(a.priority) - priorityRank(b.priority)
    case "owner":
      return (a.productOwner?.name ?? "~").localeCompare(b.productOwner?.name ?? "~")
    case "assignee":
      return (a.assignee?.name ?? "~").localeCompare(b.assignee?.name ?? "~")
    case "due":
      return (a.due ?? "9999").localeCompare(b.due ?? "9999")
    case "updated":
      return b.updated.localeCompare(a.updated)
  }
}

const PAGE_SIZE = 100

export default function BacklogPage() {
  const [project, setProject] = useState<ProjectFilter>("all")
  const [scope, setScope] = useState<IssueScope>("open")
  const { issues, error, loading, firstLoad, reload, patchIssue } = useIssues(project, scope)

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [type, setType] = useState("")
  const [priority, setPriority] = useState("")
  const [assignee, setAssignee] = useState("")
  const [owner, setOwner] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "updated", desc: false })
  const [shown, setShown] = useState(PAGE_SIZE)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const types = useMemo(() => [...new Set(issues.map((i) => i.type))].sort(), [issues])
  const priorities = useMemo(
    () => [...new Set(issues.map((i) => i.priority).filter((p): p is string => !!p))].sort((a, b) => priorityRank(a) - priorityRank(b)),
    [issues]
  )
  const assignees = useMemo(() => peopleOf(issues, (i) => i.assignee), [issues])
  const owners = useMemo(() => peopleOf(issues, (i) => i.productOwner), [issues])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = issues.filter(
      (i) =>
        (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q) || i.labels.some((l) => l.toLowerCase().includes(q))) &&
        (!category || i.statusCategory === category) &&
        (!type || i.type === type) &&
        (!priority || i.priority === priority) &&
        matchesPerson(i.assignee, assignee) &&
        matchesPerson(i.productOwner, owner)
    )
    filtered.sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key))
    return filtered
  }, [issues, query, category, type, priority, assignee, owner, sort])

  const filtersOn = Boolean(query || category || type || priority || assignee || owner)

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Backlog"
        description="Every issue across IGD, ISR and IC. Sort by any column, click a row to open it."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <ProjectTabs value={project} onChange={setProject} />
        <Segmented<IssueScope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "open", label: "Not done" },
            { value: "sprint", label: "Active sprint" },
            { value: "recent", label: "Updated in 30 days" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(PAGE_SIZE)
          }}
          placeholder="Search key, summary or label…"
          className={cn(inputClass, "w-64")}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(inputClass, "w-36")} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{STATUS_CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={cn(inputClass, "w-36")} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cn(inputClass, "w-36")} aria-label="Priority">
          <option value="">All priorities</option>
          {priorities.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <PersonSelect label="Product Owner" emptyLabel="No Product Owner" people={owners} value={owner} onChange={setOwner} className="w-52" />
        <PersonSelect label="Assignee" emptyLabel="Unassigned" people={assignees} value={assignee} onChange={setAssignee} className="w-44" />
        {filtersOn && (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setCategory("")
              setType("")
              setPriority("")
              setAssignee("")
              setOwner("")
            }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">
          {rows.length} {filtersOn ? `of ${issues.length} ` : ""}issue{rows.length === 1 ? "" : "s"}
          {issues.length >= 500 && " (first 500 from Jira)"}
        </span>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}

      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Loading issues from Jira…
        </div>
      )}

      {!error && !firstLoad && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={cn("px-4 py-3 font-semibold", c.className)}>
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-900">
                        {c.label}
                        {sort.key === c.key &&
                          (sort.desc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, shown).map((issue) => {
                  const overdue = daysOverdue(issue)
                  return (
                    <tr key={issue.key} onClick={() => setOpenKey(issue.key)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium text-slate-700">
                          <TypeIcon type={issue.type} /> {issue.key}
                        </span>
                      </td>
                      <td className="max-w-0 px-4 py-2.5">
                        <p className="truncate text-slate-900" title={issue.summary}>{issue.summary}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={issue.status} category={issue.statusCategory} />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1 text-slate-700">
                          <PriorityIcon priority={issue.priority} /> {issue.priority ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="truncate text-slate-700">{issue.productOwner?.name ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 text-slate-700">
                          <Avatar person={issue.assignee} />
                          <span className="truncate">{issue.assignee?.name ?? "Unassigned"}</span>
                        </span>
                      </td>
                      <td className={cn("px-4 py-2.5 whitespace-nowrap", overdue !== null && overdue > 0 ? "font-medium text-red-600" : "text-slate-600")}>
                        {fmtDate(issue.due)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{timeAgo(issue.updated)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="p-10 text-center text-sm text-slate-500">No issues match.</p>}
          {rows.length > shown && (
            <div className="border-t p-3 text-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className="text-sm font-medium text-sky-700 hover:underline">
                Show {Math.min(PAGE_SIZE, rows.length - shown)} more
              </button>
            </div>
          )}
        </Card>
      )}

      <IssueDrawer issueKey={openKey} onClose={() => setOpenKey(null)} onChanged={patchIssue} />
    </div>
  )
}
