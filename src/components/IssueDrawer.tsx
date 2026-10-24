"use client"

import { useEffect, useState } from "react"
import { ExternalLink, X } from "lucide-react"
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client"
import type { IssueDetail, IssueSummary, Person } from "@/lib/jira-types"
import {
  Avatar,
  ErrorBox,
  fmtDate,
  fmtDateTime,
  inputClass,
  PriorityIcon,
  primaryButtonClass,
  Spinner,
  StatusPill,
  TypeIcon,
} from "@/components/ui-kit"

interface Props {
  issueKey: string | null
  onClose: () => void
  /** Called after a successful change so the list behind the panel can update in place. */
  onChanged: (key: string, patch: Partial<IssueSummary>) => void
}

export function IssueDrawer({ issueKey, onClose, onChanged }: Props) {
  if (!issueKey) return null
  // Keyed so every issue starts with fresh state.
  return <DrawerBody key={issueKey} issueKey={issueKey} onClose={onClose} onChanged={onChanged} />
}

let prioritiesPromise: Promise<string[]> | null = null

function usePriorities() {
  const [priorities, setPriorities] = useState<string[]>([])
  useEffect(() => {
    prioritiesPromise ??= apiFetch<{ priorities: string[] }>("/api/jira/priorities")
      .then((d) => d.priorities)
      .catch(() => {
        prioritiesPromise = null
        return []
      })
    let cancelled = false
    prioritiesPromise.then((list) => {
      if (!cancelled) setPriorities(list)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return priorities
}

function DrawerBody({ issueKey, onClose, onChanged }: Props & { issueKey: string }) {
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<{ count: number; issue: IssueDetail | null; error: ApiError | null }>({
    count: -1,
    issue: null,
    error: null,
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [comment, setComment] = useState("")
  const priorities = usePriorities()

  useEffect(() => {
    let cancelled = false
    apiFetch<{ issue: IssueDetail }>(`/api/issues/${issueKey}`)
      .then((d) => {
        if (!cancelled) setResult({ count: reloadCount, issue: d.issue, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setResult((r) => ({ ...r, count: reloadCount, error: err instanceof ApiError ? err : new ApiError(String(err), 0) }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [issueKey, reloadCount])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const loading = result.count !== reloadCount
  const issue = result.issue

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label)
    setActionError(null)
    try {
      await action()
      setReloadCount((n) => n + 1)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  function changeStatus(transitionId: string) {
    const t = issue?.transitions.find((x) => x.id === transitionId)
    if (!t) return
    run("status", async () => {
      await apiFetch(`/api/issues/${issueKey}/transitions`, { method: "POST", body: { transitionId } })
      onChanged(issueKey, { status: t.to, statusCategory: t.toCategory })
    })
  }

  function changePriority(priority: string) {
    run("priority", async () => {
      await apiFetch(`/api/issues/${issueKey}`, { method: "PATCH", body: { priority } })
      onChanged(issueKey, { priority })
    })
  }

  function changeAssignee(person: Person | null) {
    run("assignee", async () => {
      await apiFetch(`/api/issues/${issueKey}`, { method: "PATCH", body: { assignee: person?.id ?? null } })
      onChanged(issueKey, { assignee: person })
    })
  }

  function postComment() {
    const body = comment.trim()
    if (!body) return
    run("comment", async () => {
      await apiFetch(`/api/issues/${issueKey}/comments`, { method: "POST", body: { body } })
      setComment("")
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`Issue ${issueKey}`}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b px-6 py-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            {issue && <TypeIcon type={issue.type} />}
            <span>{issueKey}</span>
            {loading && <Spinner />}
          </div>
          <div className="flex items-center gap-1">
            {issue && (
              <a
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                Open in Jira <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!issue && result.error && <ErrorBox error={result.error} onRetry={() => setReloadCount((n) => n + 1)} />}
          {!issue && !result.error && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner /> Loading issue…
            </div>
          )}

          {issue && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold leading-snug text-slate-900">{issue.summary}</h2>

              {actionError && <ErrorBox error={new Error(actionError)} />}

              <dl className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Status</dt>
                <dd className="flex items-center gap-2">
                  <StatusPill status={issue.status} category={issue.statusCategory} />
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
                    value=""
                    disabled={busy !== null || !issue.transitions.length}
                    onChange={(e) => changeStatus(e.target.value)}
                    aria-label="Move to status"
                  >
                    <option value="">{issue.transitions.length ? "Move to…" : "No moves available"}</option>
                    {issue.transitions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name === t.to ? t.to : `${t.name} → ${t.to}`}
                      </option>
                    ))}
                  </select>
                  {busy === "status" && <Spinner />}
                </dd>

                <dt className="text-slate-500">Assignee</dt>
                <dd>
                  <AssigneePicker
                    issueKey={issueKey}
                    assignee={issue.assignee}
                    disabled={busy !== null}
                    onPick={changeAssignee}
                  />
                </dd>

                <dt className="text-slate-500">Priority</dt>
                <dd className="flex items-center gap-2">
                  <PriorityIcon priority={issue.priority} />
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-60"
                    value={issue.priority ?? ""}
                    disabled={busy !== null || !priorities.length}
                    onChange={(e) => changePriority(e.target.value)}
                    aria-label="Priority"
                  >
                    {!issue.priority && <option value="">None</option>}
                    {issue.priority && !priorities.includes(issue.priority) && (
                      <option value={issue.priority}>{issue.priority}</option>
                    )}
                    {priorities.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {busy === "priority" && <Spinner />}
                </dd>

                <dt className="text-slate-500">Product Owner</dt>
                <dd className="flex items-center gap-2 text-slate-800">
                  {issue.productOwner ? <><Avatar person={issue.productOwner} /> {issue.productOwner.name}</> : "—"}
                </dd>

                <dt className="text-slate-500">Type</dt>
                <dd className="text-slate-800">{issue.type}</dd>

                <dt className="text-slate-500">Reporter</dt>
                <dd className="flex items-center gap-2 text-slate-800">
                  <Avatar person={issue.reporter} /> {issue.reporter?.name ?? "—"}
                </dd>

                <dt className="text-slate-500">Due date</dt>
                <dd className="text-slate-800">{fmtDate(issue.due)}</dd>

                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-800">{fmtDateTime(issue.created)}</dd>

                <dt className="text-slate-500">Updated</dt>
                <dd className="text-slate-800">{fmtDateTime(issue.updated)}</dd>

                {issue.labels.length > 0 && (
                  <>
                    <dt className="text-slate-500">Labels</dt>
                    <dd className="flex flex-wrap gap-1">
                      {issue.labels.map((l) => (
                        <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{l}</span>
                      ))}
                    </dd>
                  </>
                )}
              </dl>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Description</h3>
                {issue.description ? (
                  <div className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                    {issue.description}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No description.</p>
                )}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">
                  Comments <span className="font-normal text-slate-400">({issue.comments.length})</span>
                </h3>
                <div className="space-y-4">
                  {issue.comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <Avatar person={c.author} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 text-sm">
                          <span className="font-medium text-slate-900">{c.author?.name ?? "Unknown"}</span>
                          <span className="text-xs text-slate-400">{fmtDateTime(c.created)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="Add a comment…"
                    className={inputClass}
                    disabled={busy !== null}
                  />
                  <button
                    type="button"
                    className={primaryButtonClass}
                    disabled={busy !== null || !comment.trim()}
                    onClick={postComment}
                  >
                    {busy === "comment" && <Spinner className="text-white" />}
                    Add comment
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function AssigneePicker({
  issueKey,
  assignee,
  disabled,
  onPick,
}: {
  issueKey: string
  assignee: Person | null
  disabled: boolean
  onPick: (person: Person | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ query: string; users: Person[] } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ query })
      apiFetch<{ users: Person[] }>(`/api/issues/${issueKey}/assignable?${params}`)
        .then((d) => {
          if (!cancelled) setResults({ query, users: d.users })
        })
        .catch(() => {
          if (!cancelled) setResults({ query, users: [] })
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query, issueKey])

  function pick(person: Person | null) {
    setOpen(false)
    setQuery("")
    onPick(person)
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-slate-800 hover:bg-slate-100 disabled:opacity-60"
      >
        <Avatar person={assignee} /> {assignee?.name ?? "Unassigned"}
      </button>
    )
  }

  const searching = results?.query !== query
  return (
    <div className="relative">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setOpen(false))}
        placeholder="Search people…"
        className={inputClass}
      />
      <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
        <button type="button" onClick={() => pick(null)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50">
          <Avatar person={null} /> Unassigned
        </button>
        {searching && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500">
            <Spinner /> Searching…
          </div>
        )}
        {!searching && results?.users.length === 0 && (
          <div className="px-3 py-1.5 text-sm text-slate-500">No one found.</div>
        )}
        {!searching &&
          results?.users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => pick(u)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              <Avatar person={u} /> {u.name}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full border-t px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
