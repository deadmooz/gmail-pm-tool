"use client"

import { useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { useFlow } from "@/hooks/useFlow"
import { useTeam } from "@/hooks/useTeam"
import { addDays, daysOverdue, deadline, isDone, todayIso, type IssueSummary } from "@/lib/jira-types"
import { forecastIssue, type FlowBaseline, type IssueFlow } from "@/lib/flow"
import { computeLoads, loadLevel, makeCalendar, sprintWindow, utilization } from "@/lib/capacity"
import { ROLE_LABEL, type TeamData } from "@/lib/team-types"
import { Card, ErrorBox, fmtDate, PageHeader, peopleOf, PersonSelect, RefreshButton, Segmented, Spinner, secondaryButtonClass } from "@/components/ui-kit"

type Kind = "daily" | "weekly"

const line = (i: IssueSummary, extra = "") => `• ${i.key} – ${i.summary}${extra}`
const po = (i: IssueSummary) => (i.productOwner ? ` (PO ${i.productOwner.name})` : "")

function section(title: string, items: string[], empty?: string): string[] {
  if (!items.length) return empty ? [title, `• ${empty}`, ""] : []
  return [title, ...items, ""]
}

function finishedAt(i: IssueSummary, flows: Record<string, IssueFlow>): string | null {
  return (i.resolved ?? flows[i.key]?.doneAt ?? null)?.slice(0, 10) ?? null
}

function nextWorkingDay(today: string, team: TeamData | null): string {
  const isWorking = team ? makeCalendar(team) : (d: string) => new Date(d + "T00:00:00Z").getUTCDay() !== 0
  let d = addDays(today, 1)
  for (let i = 0; i < 10 && !isWorking(d); i++) d = addDays(d, 1)
  return d
}

function dailyText(issues: IssueSummary[], flows: Record<string, IssueFlow>, baseline: FlowBaseline | null, team: TeamData | null): string {
  const today = todayIso()
  const tomorrow = nextWorkingDay(today, team)
  const open = issues.filter((i) => !isDone(i))
  const forecast = (i: IssueSummary) => forecastIssue(i, flows[i.key], baseline, today)

  const deployingToday = issues.filter((i) => i.delivery.deployment === today)
  const deployingNext = issues.filter((i) => i.delivery.deployment === tomorrow)
  const late = open
    .filter((i) => (daysOverdue(i, today) ?? 0) > 0)
    .sort((a, b) => (deadline(a) ?? "").localeCompare(deadline(b) ?? ""))
  const risky = open.filter((i) => ["at-risk", "will-slip"].includes(forecast(i).status))
  const qaQueue = open
    .filter((i) => flows[i.key]?.current === "waitQa")
    .map((i) => ({ i, days: (Date.now() - Date.parse(flows[i.key].currentSince ?? new Date().toISOString())) / 86400000 }))
    .sort((a, b) => b.days - a.days)
  const onHold = open.filter((i) => flows[i.key]?.current === "hold")

  let over: string[] = []
  if (team) {
    const sprintIssues = issues.filter((i) => i.sprint?.state === "active")
    const win = sprintWindow(sprintIssues, "active")
    if (win) {
      over = computeLoads(sprintIssues, team, { start: win.start, end: win.end, mode: "remaining", today })
        .filter((l) => !l.unassigned && l.role && loadLevel(l) === "over")
        .map((l) => `• ${l.person.name} (${ROLE_LABEL[l.role!]}) – ${Math.round(utilization(l) * 100)}% of their remaining sprint hours`)
    }
  }

  return [
    `Daily delivery update – ${fmtDate(today)}`,
    "",
    ...section(`Deploying today (${deployingToday.length})`, deployingToday.map((i) => line(i, (isDone(i) ? " ✓ done" : "") + po(i))), "Nothing scheduled"),
    ...section(`Deploying ${fmtDate(tomorrow)} (${deployingNext.length})`, deployingNext.map((i) => line(i, po(i))), "Nothing scheduled"),
    ...section(
      `Past deployment date, not done (${late.length})`,
      late.slice(0, 10).map((i) => line(i, ` – ${daysOverdue(i, today)}d late${po(i)}`)).concat(late.length > 10 ? [`• …and ${late.length - 10} more`] : [])
    ),
    ...section(
      `Likely to miss deployment (${risky.length})`,
      risky.map((i) => {
        const f = forecast(i)
        return line(i, ` – due ${fmtDate(i.delivery.deployment)}, likely ${fmtDate(f.predicted)}${po(i)}`)
      })
    ),
    ...section(
      `Waiting for QA (${qaQueue.length})`,
      qaQueue.slice(0, 10).map(({ i, days }) => line(i, ` – waiting ${Math.round(days * 10) / 10}d`))
    ),
    ...section(`On hold (${onHold.length})`, onHold.map((i) => line(i, po(i)))),
    ...section(`Over capacity this sprint (${over.length})`, over),
  ]
    .join("\n")
    .trim()
}

function weeklyText(
  ownerName: string,
  issues: IssueSummary[],
  flows: Record<string, IssueFlow>,
  baseline: FlowBaseline | null
): string {
  const today = todayIso()
  const weekAgo = addDays(today, -6)
  const nextWeek = addDays(today, 6)
  const open = issues.filter((i) => !isDone(i))
  const forecast = (i: IssueSummary) => forecastIssue(i, flows[i.key], baseline, today)

  const finished = issues.filter((i) => {
    const at = finishedAt(i, flows)
    return isDone(i) && !!at && at >= weekAgo && at <= today
  })
  const upcoming = open
    .filter((i) => i.delivery.deployment && i.delivery.deployment >= today && i.delivery.deployment <= nextWeek)
    .sort((a, b) => (a.delivery.deployment ?? "").localeCompare(b.delivery.deployment ?? ""))
  const late = open.filter((i) => (daysOverdue(i, today) ?? 0) > 0)
  const risky = open.filter((i) => ["at-risk", "will-slip"].includes(forecast(i).status))
  const onHold = open.filter((i) => flows[i.key]?.current === "hold")
  const sprint = issues.filter((i) => i.sprint?.state === "active")
  const sprintDone = sprint.filter(isDone).length

  return [
    `Weekly update – ${ownerName} – week of ${fmtDate(weekAgo)} to ${fmtDate(today)}`,
    "",
    `Current sprint: ${sprintDone} of ${sprint.length} issues done (${sprint.length ? Math.round((sprintDone / sprint.length) * 100) : 0}%)`,
    "",
    ...section(`Finished this week (${finished.length})`, finished.map((i) => line(i)), "Nothing finished"),
    ...section(
      `Deploying in the next 7 days (${upcoming.length})`,
      upcoming.map((i) => {
        const f = forecast(i)
        const risk = f.status === "will-slip" || f.status === "at-risk" ? ` – ${f.status === "will-slip" ? "likely to slip" : "at risk"}` : ""
        return line(i, ` – ${fmtDate(i.delivery.deployment)}${risk}`)
      }),
      "Nothing scheduled"
    ),
    ...section(`Past deployment date, not done (${late.length})`, late.map((i) => line(i, ` – ${daysOverdue(i, today)}d late`))),
    ...section(
      `Likely to miss deployment (${risky.length})`,
      risky.map((i) => line(i, ` – due ${fmtDate(i.delivery.deployment)}, likely ${fmtDate(forecast(i).predicted)}`))
    ),
    ...section(`On hold (${onHold.length})`, onHold.map((i) => line(i))),
  ]
    .join("\n")
    .trim()
}

export default function UpdatesPage() {
  const [kind, setKind] = useState<Kind>("daily")
  const [owner, setOwner] = useState("")
  const [copied, setCopied] = useState(false)
  const { issues, flows, baseline, error, loading, firstLoad, reload } = useFlow("all", "deploy")
  const team = useTeam()

  const owners = useMemo(() => peopleOf(issues, (i) => i.productOwner), [issues])

  const text = useMemo(() => {
    if (firstLoad) return ""
    if (kind === "daily") return dailyText(issues, flows, baseline, team.team)
    const ownerName = owner === "none" ? "No Product Owner" : owners.find((o) => o.id === owner)?.name ?? "All Product Owners"
    const mine = issues.filter((i) => !owner || (owner === "none" ? !i.productOwner : i.productOwner?.id === owner))
    return weeklyText(ownerName, mine, flows, baseline)
  }, [kind, owner, owners, issues, flows, baseline, team.team, firstLoad])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Updates"
        description="Ready-to-paste delivery updates built from Jira. Review, copy and share them yourself; PM Board doesn't send anything."
        actions={<RefreshButton loading={loading} onClick={reload} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "daily", label: "Daily update" },
            { value: "weekly", label: "Weekly by Product Owner" },
          ]}
        />
        {kind === "weekly" && (
          <PersonSelect label="Product Owner" emptyLabel="No Product Owner" people={owners} value={owner} onChange={setOwner} className="w-56" />
        )}
        <button type="button" onClick={copy} disabled={!text} className={`${secondaryButtonClass} ml-auto`}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy text"}
        </button>
      </div>

      {error && <ErrorBox error={error} onRetry={reload} />}
      {!error && firstLoad && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Spinner /> Building the update from Jira…
        </div>
      )}
      {!error && !firstLoad && (
        <Card className="p-5">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">{text}</pre>
        </Card>
      )}
    </div>
  )
}
