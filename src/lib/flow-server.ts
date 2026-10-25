import { recentClosedSprints, searchIssues, statusHistories, type JiraCtx } from "@/lib/jira"
import { addDays, diffDays, isBug, type IssueSummary } from "@/lib/jira-types"
import { buildBaseline, buildFlow, median, type FlowBaseline, type IssueFlow } from "@/lib/flow"
import type { SprintStat } from "@/lib/history-types"

/** Status-history flow for each issue, keyed by issue key. */
export async function flowsFor(ctx: JiraCtx, issues: IssueSummary[]): Promise<Record<string, IssueFlow>> {
  const histories = await statusHistories(ctx, issues.map((i) => i.id))
  const out: Record<string, IssueFlow> = {}
  for (const issue of issues) out[issue.key] = buildFlow(issue, histories.get(issue.id) ?? [])
  return out
}

// Closed work doesn't change often, so these are cached per Jira site.
const baselineCache = new Map<string, { at: number; value: Promise<FlowBaseline | null> }>()
const historyCache = new Map<string, { at: number; value: Promise<SprintStat[]> }>()

function cached<T>(cache: Map<string, { at: number; value: Promise<T> }>, key: string, ttlMs: number, load: () => Promise<T>) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value
  const value = load()
  value.catch(() => cache.delete(key))
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Typical phase times from issues finished in the last 90 days. */
export function baselineFor(ctx: JiraCtx, projects: string[]): Promise<FlowBaseline | null> {
  return cached(baselineCache, `${ctx.domain}|${projects.join(",")}`, 30 * 60_000, async () => {
    const jql = `project in (${projects.join(", ")}) AND statusCategory = Done AND resolved >= -90d ORDER BY resolved DESC`
    const done = await searchIssues(ctx, jql, 400)
    if (!done.length) return null
    return buildBaseline(done, await flowsFor(ctx, done))
  })
}

/** Inclusive calendar days between two dates, or null if either is missing. */
function plannedDays(start: string | null, end: string | null): number | null {
  if (!start || !end || end < start) return null
  return diffDays(start, end) + 1
}

/** Recent closed sprints of one project's board, with what was committed, finished and carried over. */
export function sprintHistory(ctx: JiraCtx, project: string, count = 6): Promise<SprintStat[]> {
  return cached(historyCache, `${ctx.domain}|${project}|${count}`, 60 * 60_000, async () => {
    // Boards can show other projects' sprints too; keep this project's own (named "ISR-…", "IGD …"),
    // unless the board doesn't name sprints that way at all.
    const recent = await recentClosedSprints(ctx, project, count * 4)
    const own = recent.filter((s) => s.name.toUpperCase().startsWith(project))
    const sprints = (own.length ? own : recent).slice(-count)
    if (!sprints.length) return []
    const issues = await searchIssues(ctx, `project = ${project} AND sprint in (${sprints.map((s) => s.id).join(", ")})`, 1000)
    const flows = await flowsFor(ctx, issues)
    const hours = (i: IssueSummary) => (i.delivery.beEstimate ?? 0) + (i.delivery.feEstimate ?? 0) + (i.delivery.qaEstimate ?? 0)

    const stats: SprintStat[] = sprints.map((s) => {
      const committed = issues.filter((i) => i.sprintIds.includes(s.id))
      const finishBy = addDays(s.completed ?? s.end ?? "9999-12-31", 1)
      // Not every workflow sets Jira's resolution date, so fall back to when the card entered Done.
      const finishedAt = (i: IssueSummary) => (i.resolved ?? flows[i.key]?.doneAt ?? null)?.slice(0, 10) ?? null
      const done = committed.filter((i) => {
        const at = finishedAt(i)
        return i.statusCategory === "done" && !!at && at <= finishBy
      })
      // Sprint ids grow over time, so a higher id on the same issue means a later sprint.
      const carried = committed.filter((i) => !done.includes(i) && i.sprintIds.some((id) => id > s.id))

      const devRatios: number[] = []
      const qaRatios: number[] = []
      for (const i of committed) {
        const f = flows[i.key]
        if (!f) continue
        const d = i.delivery
        const devPlan = Math.max(plannedDays(d.beStart, d.beEnd) ?? 0, plannedDays(d.feStart, d.feEnd) ?? 0)
        if (devPlan > 0 && f.phaseDays.dev > 0) devRatios.push(f.phaseDays.dev / devPlan)
        const qaPlan = plannedDays(d.qaStart, d.qaEnd)
        if (qaPlan && f.phaseDays.qa > 0) qaRatios.push(f.phaseDays.qa / qaPlan)
      }

      return {
        id: s.id,
        name: s.name,
        project,
        start: s.start,
        end: s.end,
        completed: s.completed,
        committed: committed.length,
        done: done.length,
        carriedOver: carried.length,
        notDone: committed.length - done.length,
        bugs: committed.filter(isBug).length,
        plannedHours: Math.round(committed.reduce((sum, i) => sum + hours(i), 0)),
        doneHours: Math.round(done.reduce((sum, i) => sum + hours(i), 0)),
        devAccuracy: devRatios.length ? median(devRatios) : null,
        qaAccuracy: qaRatios.length ? median(qaRatios) : null,
        accuracySample: { dev: devRatios.length, qa: qaRatios.length },
        bounceRate: committed.length
          ? Math.round((committed.filter((i) => (flows[i.key]?.bounces ?? 0) > 0).length / committed.length) * 100)
          : 0,
      }
    })
    // Sprints with a couple of stray cards are usually mis-created; they'd only distort the trend.
    return stats.filter((s) => s.committed >= 3)
  })
}
