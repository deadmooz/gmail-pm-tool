"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, X } from "lucide-react"
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client"
import { qaAfterDeployment, releaseSlip, type IssueDetail, type Person } from "@/lib/jira-types"
import type { TeamData } from "@/lib/team-types"
import { qaPerson } from "@/lib/capacity"
import { cn } from "@/lib/utils"
import {
  Avatar,
  ErrorBox,
  fmtDate,
  fmtDateTime,
  inputClass,
  PriorityIcon,
  Spinner,
  StatusPill,
  TypeIcon,
} from "@/components/ui-kit"

interface Props {
  issueKey: string | null
  onClose: () => void
  /** PM Board planning data, for the QA assignment. */
  team: TeamData | null
  /** Called after the QA assignment changes so the page can reload team data. */
  onTeamChanged: () => void
}

export function IssueDrawer({ issueKey, ...rest }: Props) {
  if (!issueKey) return null
  // Keyed so every issue starts with fresh state.
  return <DrawerBody key={issueKey} issueKey={issueKey} {...rest} />
}

function DrawerBody({ issueKey, onClose, team, onTeamChanged }: Props & { issueKey: string }) {
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<{ count: number; issue: IssueDetail | null; error: ApiError | null }>({
    count: -1,
    issue: null,
    error: null,
  })

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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-label={`Issue ${issueKey}`} className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
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
              <div>
                <h2 className="text-xl font-semibold leading-snug text-slate-900">{issue.summary}</h2>
                <p className="mt-1 text-xs text-slate-400">Read-only view. Make changes in Jira.</p>
              </div>

              <dl className="grid grid-cols-[130px_1fr] items-center gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Status</dt>
                <dd><StatusPill status={issue.status} category={issue.statusCategory} /></dd>

                <dt className="text-slate-500">Assignee</dt>
                <dd className="flex items-center gap-2 text-slate-800">
                  <Avatar person={issue.assignee} /> {issue.assignee?.name ?? "Unassigned"}
                </dd>

                <dt className="text-slate-500">Product Owner</dt>
                <dd className="flex items-center gap-2 text-slate-800">
                  {issue.productOwner ? <><Avatar person={issue.productOwner} /> {issue.productOwner.name}</> : "—"}
                </dd>

                <dt className="text-slate-500">Priority</dt>
                <dd className="flex items-center gap-1.5 text-slate-800">
                  <PriorityIcon priority={issue.priority} /> {issue.priority ?? "None"}
                </dd>

                <dt className="text-slate-500">Type</dt>
                <dd className="text-slate-800">{issue.type}</dd>

                <dt className="text-slate-500">Sprint</dt>
                <dd className="text-slate-800">{issue.sprint?.name ?? "—"}</dd>
              </dl>

              <DeliverySection issue={issue} team={team} onTeamChanged={onTeamChanged} />

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
                {issue.comments.length === 0 && <p className="text-sm text-slate-400">No comments.</p>}
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
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function PhaseRow({
  label,
  person,
  start,
  end,
  hours,
  extra,
}: {
  label: string
  person: Person | null
  start: string | null
  end: string | null
  hours: number | null
  extra?: React.ReactNode
}) {
  return (
    <tr className="align-top">
      <td className="py-2 pr-3 font-medium text-slate-600">{label}</td>
      <td className="py-2 pr-3">
        {extra ?? (
          <span className="flex items-center gap-2 text-slate-800">
            <Avatar person={person} /> {person?.name ?? <span className="text-slate-400">Not set</span>}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">
        {start || end ? `${fmtDate(start)} → ${fmtDate(end)}` : <span className="text-slate-400">No dates</span>}
      </td>
      <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-700">{hours !== null ? `${hours}h` : "—"}</td>
    </tr>
  )
}

function DeliverySection({
  issue,
  team,
  onTeamChanged,
}: {
  issue: IssueDetail
  team: TeamData | null
  onTeamChanged: () => void
}) {
  const d = issue.delivery
  const slip = releaseSlip(issue)
  const signoffs: [string, string | null][] = [
    ["PRD", d.prdSignoff],
    ["SPM", d.spmSignoff],
    ["Tech feasibility", d.techFeasibility],
    ["UAT", d.uatSignoff],
  ]

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Delivery</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <PhaseRow label="Back-end" person={d.beDev} start={d.beStart} end={d.beEnd} hours={d.beEstimate} />
          <PhaseRow label="Front-end" person={d.feDev} start={d.feStart} end={d.feEnd} hours={d.feEstimate} />
          <PhaseRow
            label="QA"
            person={null}
            start={d.qaStart}
            end={d.qaEnd}
            hours={d.qaEstimate}
            extra={<QaPicker issue={issue} team={team} onTeamChanged={onTeamChanged} />}
          />
        </tbody>
      </table>

      <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Deployment date</dt>
        <dd className={cn("text-slate-800", qaAfterDeployment(issue) && "font-medium text-red-600")}>
          {fmtDate(d.deployment)}
          {qaAfterDeployment(issue) && <span className="ml-2 text-xs">QA ends {fmtDate(d.qaEnd)}, after this</span>}
        </dd>
        <dt className="text-slate-500">Release date</dt>
        <dd className="text-slate-800">
          {fmtDate(d.release)}
          {slip && (
            <span className="ml-2 rounded bg-amber-50 px-1.5 text-xs font-medium text-amber-800">
              moved to {fmtDate(slip.to)} ({slip.days > 0 ? "+" : ""}{slip.days}d)
            </span>
          )}
        </dd>
        <dt className="text-slate-500">Sign-offs</dt>
        <dd className="flex flex-wrap gap-1.5">
          {signoffs.map(([label, value]) => (
            <span
              key={label}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                value?.toLowerCase() === "yes" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              )}
            >
              {label}: {value ?? "—"}
            </span>
          ))}
        </dd>
      </dl>
    </section>
  )
}

/** QA isn't a Jira field, so who tests a card is recorded in PM Board. */
function QaPicker({ issue, team, onTeamChanged }: { issue: IssueDetail; team: TeamData | null; onTeamChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!team) return <Spinner />

  const current = qaPerson(issue, team)
  const qaMembers = team.members.filter((m) => m.role === "QA")
  const explicit = Boolean(team.qa[issue.key])

  async function change(accountId: string) {
    setBusy(true)
    setError(null)
    try {
      const member = qaMembers.find((m) => m.accountId === accountId)
      await apiFetch("/api/team/qa", {
        method: "PUT",
        body: { issueKey: issue.key, accountId: accountId || null, name: member?.name },
      })
      onTeamChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!qaMembers.length) {
    return (
      <span className="text-xs text-slate-500">
        No QA people set up yet. <Link href="/team" className="text-sky-700 underline">Team setup</Link>
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={explicit ? current?.id ?? "" : ""}
          onChange={(e) => change(e.target.value)}
          disabled={busy}
          className={cn(inputClass, "py-1")}
          aria-label="QA person"
        >
          <option value="">{!explicit && current ? `${current.name} (Jira assignee)` : "Not assigned"}</option>
          {qaMembers.map((m) => (
            <option key={m.accountId} value={m.accountId}>{m.name}</option>
          ))}
        </select>
        {busy && <Spinner />}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
