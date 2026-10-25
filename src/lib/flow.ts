// Flow metrics from Jira status history. Pure functions, used on server and browser.
//
// Every Jira status is mapped to a delivery phase. From the dates an issue
// moved between statuses we get how long it really spent in each phase, how
// long it waited for QA, and how often QA sent it back to development.

import { addDays, diffDays, isBug, todayIso, type IssueSummary } from "@/lib/jira-types"

export type Phase = "backlog" | "dev" | "waitQa" | "qa" | "release" | "hold" | "done"

/** Phases that represent active delivery, in order. */
export const FLOW_PHASES = ["dev", "waitQa", "qa", "release"] as const
export type FlowPhase = (typeof FLOW_PHASES)[number]

export const PHASE_LABEL: Record<Phase, string> = {
  backlog: "Not started",
  dev: "Development",
  waitQa: "Waiting for QA",
  qa: "QA",
  release: "UAT & release",
  hold: "On hold",
  done: "Done",
}

// Checked in this order; the first match wins.
const PHASE_RULES: [Phase, RegExp][] = [
  ["done", /^(done\.?|resolved|closed|live testing done)$/i],
  ["hold", /on hold|blocked|rejected|overlap/i],
  ["waitQa", /ready for (testing|qa)/i],
  ["release", /uat|pre-?prod|production|go live|ready to go|live testing/i],
  // In these workflows code review happens after testing, so it counts as QA.
  ["qa", /testing|\bqa\b|re-?testing|code review/i],
  // Design and refinement statuses come before development, even "Design In Progress".
  // "Allocated" = given to a developer but not started yet.
  ["backlog", /design|backlog|ready for (signoff|technical)|issue confirm|to do|allocated/i],
  ["dev", /development|in progress|local demo|bug fixing/i],
]

export function phaseOf(status: string): Phase {
  for (const [phase, re] of PHASE_RULES) if (re.test(status.trim())) return phase
  return "backlog"
}

export interface StatusChangeLite {
  at: string
  from: string
  to: string
}

/** What PM Board knows about one issue's real journey through the workflow. */
export interface IssueFlow {
  key: string
  /** Calendar days spent in each phase (fractional). */
  phaseDays: Record<Phase, number>
  /** Times the card went from waiting-for-QA / QA / release back to development. */
  bounces: number
  current: Phase
  /** When the card entered its current phase. */
  currentSince: string | null
  firstDevAt: string | null
  firstQaAt: string | null
  doneAt: string | null
}

const HOUR = 3600_000
// Status visits shorter than this are click-throughs (people stepping a card
// through several statuses at once), not real work, so they don't count as
// entering a phase or as a bounce back to development.
const MIN_VISIT_MS = 10 * 60_000

function emptyDays(): Record<Phase, number> {
  return { backlog: 0, dev: 0, waitQa: 0, qa: 0, release: 0, hold: 0, done: 0 }
}

export function buildFlow(issue: IssueSummary, changes: StatusChangeLite[], now = new Date()): IssueFlow {
  const phaseDays = emptyDays()
  let bounces = 0
  let firstDevAt: string | null = null
  let firstQaAt: string | null = null
  let doneAt: string | null = null

  // Status segments: initial status from creation, then one per change.
  const segments: { status: string; start: string; end: string }[] = []
  let status = changes[0]?.from || issue.status
  let start = issue.created || changes[0]?.at || now.toISOString()
  for (const c of changes) {
    segments.push({ status, start, end: c.at })
    status = c.to
    start = c.at
  }
  segments.push({ status, start, end: now.toISOString() })

  let currentSince: string | null = start
  let previous: Phase | null = null
  for (const [i, seg] of segments.entries()) {
    const phase = phaseOf(seg.status)
    const ms = Math.max(0, Date.parse(seg.end) - Date.parse(seg.start))
    phaseDays[phase] += ms / HOUR / 24
    if (ms < MIN_VISIT_MS && i < segments.length - 1) continue
    if (phase === "dev" && !firstDevAt) firstDevAt = seg.start
    if ((phase === "waitQa" || phase === "qa") && !firstQaAt) firstQaAt = seg.start
    if (phase === "done") doneAt = seg.start
    if (previous && ["waitQa", "qa", "release"].includes(previous) && phase === "dev") bounces++
    if (phase !== previous) currentSince = seg.start
    previous = phase
  }
  for (const k of Object.keys(phaseDays) as Phase[]) phaseDays[k] = Math.round(phaseDays[k] * 10) / 10

  return {
    key: issue.key,
    phaseDays,
    bounces,
    current: phaseOf(issue.status),
    currentSince,
    firstDevAt,
    firstQaAt,
    doneAt: phaseOf(issue.status) === "done" ? doneAt : null,
  }
}

/* --------------------------------------------------------------- baselines */

export type FlowGroup = "task" | "bug"

export const flowGroup = (issue: IssueSummary): FlowGroup => (isBug(issue) ? "bug" : "task")

/** Typical days per phase, learnt from recently finished issues. */
export interface FlowBaseline {
  /** How many finished issues the numbers come from. */
  sample: Record<FlowGroup, number>
  /** Median days in each phase, for issues that went through that phase. */
  median: Record<FlowGroup, Record<FlowPhase, number>>
  /** Share of finished issues sent back from QA to development at least once. */
  bounceRate: Record<FlowGroup, number>
  /** Median days from first development to done. */
  cycleDays: Record<FlowGroup, number>
}

export function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return Math.round((s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) * 10) / 10
}

export function buildBaseline(issues: IssueSummary[], flows: Record<string, IssueFlow>): FlowBaseline {
  const groups: FlowGroup[] = ["task", "bug"]
  const sample = { task: 0, bug: 0 }
  const median_ = { task: {} as Record<FlowPhase, number>, bug: {} as Record<FlowPhase, number> }
  const bounceRate = { task: 0, bug: 0 }
  const cycleDays = { task: 0, bug: 0 }

  for (const g of groups) {
    const list = issues.filter((i) => flowGroup(i) === g && flows[i.key])
    const fl = list.map((i) => flows[i.key])
    sample[g] = fl.length
    for (const p of FLOW_PHASES) median_[g][p] = median(fl.map((f) => f.phaseDays[p]).filter((d) => d > 0.01))
    bounceRate[g] = fl.length ? Math.round((fl.filter((f) => f.bounces > 0).length / fl.length) * 100) : 0
    cycleDays[g] = median(
      fl.filter((f) => f.firstDevAt && f.doneAt).map((f) => (Date.parse(f.doneAt!) - Date.parse(f.firstDevAt!)) / (24 * HOUR))
    )
  }
  return { sample, median: median_, bounceRate, cycleDays }
}

/* ---------------------------------------------------------------- forecast */

export type ForecastStatus = "done" | "on-track" | "at-risk" | "will-slip" | "late" | "no-date"

export interface Forecast {
  status: ForecastStatus
  /** Predicted date the card reaches done, from typical phase times. */
  predicted: string | null
  /** Days between predicted finish and deployment date (positive = after). */
  slipDays: number | null
}

export const FORECAST_LABEL: Record<ForecastStatus, string> = {
  done: "Done",
  "on-track": "On track",
  "at-risk": "At risk",
  "will-slip": "Will slip",
  late: "Late",
  "no-date": "No deployment date",
}

/**
 * Predicts when a card will be done: whatever is typically left of its
 * current phase, plus the typical time for every phase after it. Compares
 * that with its Deployment Date. "At risk" = up to 2 days after; "Will slip"
 * = more than 2 days after; "Late" = the deployment date has already passed.
 */
export function forecastIssue(issue: IssueSummary, flow: IssueFlow | undefined, baseline: FlowBaseline | null, today = todayIso()): Forecast {
  const deploy = issue.delivery.deployment
  const current = flow?.current ?? phaseOf(issue.status)
  if (current === "done" || issue.statusCategory === "done") return { status: "done", predicted: null, slipDays: null }
  if (!deploy) return { status: "no-date", predicted: null, slipDays: null }
  if (deploy < today) return { status: "late", predicted: null, slipDays: diffDays(deploy, today) }
  if (!baseline) return { status: "on-track", predicted: null, slipDays: null }

  const g = flowGroup(issue)
  const typical = baseline.sample[g] >= 5 ? baseline.median[g] : baseline.median[g === "bug" ? "task" : "bug"]
  const order: Phase[] = ["backlog", "hold", ...FLOW_PHASES]
  const idx = Math.max(0, order.indexOf(current))
  let remaining = 0
  for (const p of FLOW_PHASES) {
    const pIdx = order.indexOf(p)
    if (pIdx < idx) continue
    if (p === current) {
      const spent = flow?.currentSince ? (Date.now() - Date.parse(flow.currentSince)) / (24 * HOUR) : 0
      remaining += Math.max(typical[p] - spent, Math.min(0.5, typical[p]))
    } else {
      remaining += typical[p]
    }
  }
  const predicted = addDays(today, Math.ceil(remaining))
  const slip = diffDays(deploy, predicted)
  return { status: slip <= 0 ? "on-track" : slip <= 2 ? "at-risk" : "will-slip", predicted, slipDays: slip }
}
