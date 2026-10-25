import type { User } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { HttpError } from "@/lib/http"
import type {
  BoardConfig,
  Delivery,
  IssueDetail,
  IssueSummary,
  Person,
  SprintRef,
  StatusCategory,
} from "@/lib/jira-types"

// PM Board only ever reads from Jira. There are deliberately no write calls in this module.

export interface JiraCtx {
  domain: string
  auth: string
}

export function normalizeDomain(raw: string): string {
  let domain = raw.trim().replace(/\/+$/, "")
  if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`
  return domain
}

export async function getJiraDomain(): Promise<string | null> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  const raw = settings?.jiraDomain || process.env.JIRA_DOMAIN || ""
  return raw ? normalizeDomain(raw) : null
}

/** Jira connection for one user: the shared site plus that user's own email and API token. */
export async function jiraContext(user: User): Promise<JiraCtx> {
  const domain = await getJiraDomain()
  if (!domain) {
    throw new HttpError(412, "The Jira site address hasn't been set yet. An admin can set it on the Admin page.", "NO_DOMAIN")
  }
  if (!user.jiraEmail || !user.jiraApiToken) {
    throw new HttpError(412, "Connect your Jira account in My Settings to see issues.", "NO_KEY")
  }
  const credentials = `${user.jiraEmail}:${decryptSecret(user.jiraApiToken)}`
  return { domain, auth: `Basic ${Buffer.from(credentials).toString("base64")}` }
}

function jiraErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const d = data as { errorMessages?: string[]; errors?: Record<string, string>; message?: string }
  const parts = [...(d.errorMessages ?? []), ...Object.values(d.errors ?? {})]
  if (d.message) parts.push(d.message)
  return parts.length ? parts.join(" ") : null
}

export async function jiraRequest<T>(ctx: JiraCtx, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(ctx.domain + path, {
      // POST is only used for search and bulk history lookups, which read.
      method: body !== undefined ? "POST" : "GET",
      headers: {
        Authorization: ctx.auth,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    throw new HttpError(502, "Couldn't reach Jira. Check the Jira site address and your network.")
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON body (e.g. an HTML error page); fall through with data = null.
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new HttpError(400, "Jira rejected your email or API token. Update them in My Settings.", "JIRA_AUTH")
    }
    if (res.status === 403) {
      throw new HttpError(403, jiraErrorMessage(data) ?? "Your Jira account doesn't have permission to see that.")
    }
    const message = jiraErrorMessage(data) ?? `Jira returned an error (${res.status}).`
    throw new HttpError(res.status >= 500 ? 502 : res.status, message)
  }
  return data as T
}

/* ------------------------------------------------------- custom field lookup */

// Custom fields have per-site ids (e.g. customfield_10485), so they are found by
// name once per Jira site and cached for an hour. Names are compared lower-case
// with trailing colons removed ("Back-End Dev Start Date :" -> "back-end dev start date").
const CUSTOM_FIELD_NAMES = {
  productOwner: ["product owner"],
  sprint: ["sprint"],
  beDev: ["back-end developer"],
  feDev: ["front end developer", "front-end developer"],
  beStart: ["back-end dev start date"],
  beEnd: ["back-end dev end date"],
  feStart: ["front dev start date"],
  feEnd: ["front dev end date"],
  qaStart: ["qa start date"],
  qaEnd: ["qa end date"],
  beEstimate: ["back-end developer estimate"],
  feEstimate: ["front-end developer estimate"],
  qaEstimate: ["qa estimate"],
  deployment: ["deployment date"],
  release: ["release date"],
  revisedRelease: ["revised release date"],
  prdSignoff: ["prd signoff"],
  spmSignoff: ["spm signoff"],
  uatSignoff: ["uat signoff"],
  techFeasibility: ["technical feasibility"],
  qaReview: ["qa test case review"],
  qaReviewPm: ["qa test case review for pm"],
  qaReviewDev: ["qa test case review for dev"],
} as const

export type CustomFieldIds = Record<keyof typeof CUSTOM_FIELD_NAMES, string | null>

const fieldCache = new Map<string, { at: number; ids: Promise<CustomFieldIds> }>()

function normalizeFieldName(name: string) {
  return name.toLowerCase().replace(/[\s:]+$/, "").replace(/\s+/g, " ").trim()
}

export function customFieldIds(ctx: JiraCtx): Promise<CustomFieldIds> {
  const cached = fieldCache.get(ctx.domain)
  if (cached && Date.now() - cached.at < 3600_000) return cached.ids
  const ids = jiraRequest<{ id: string; name: string; custom?: boolean }[]>(ctx, "/rest/api/2/field").then((fields) => {
    const custom = fields.filter((f) => f.custom)
    const out = {} as CustomFieldIds
    for (const [key, names] of Object.entries(CUSTOM_FIELD_NAMES) as [keyof CustomFieldIds, readonly string[]][]) {
      out[key] = custom.find((f) => (names as readonly string[]).includes(normalizeFieldName(f.name)))?.id ?? null
    }
    return out
  })
  ids.catch(() => fieldCache.delete(ctx.domain))
  fieldCache.set(ctx.domain, { at: Date.now(), ids })
  return ids
}

/** JQL reference for a custom field, e.g. "cf[10485]". */
export function jqlField(id: string | null): string | null {
  const n = id?.match(/^customfield_(\d+)$/)?.[1]
  return n ? `cf[${n}]` : null
}

/* ------------------------------------------------------------------ mapping */

interface RawPerson {
  accountId?: string
  name?: string
  displayName?: string
}

interface RawStatus {
  id?: string
  name?: string
  statusCategory?: { key?: string }
}

interface RawSprint {
  id?: number
  name?: string
  state?: string
  startDate?: string
  endDate?: string
}

interface RawIssue {
  id: string
  key: string
  fields: Record<string, unknown> & {
    summary?: string
    issuetype?: { name?: string }
    status?: RawStatus
    priority?: { name?: string } | null
    assignee?: RawPerson | null
    reporter?: RawPerson | null
    created?: string
    updated?: string
    duedate?: string | null
    resolutiondate?: string | null
    project?: { key?: string }
    labels?: string[]
    description?: string | null
    comment?: { comments?: { id: string; author?: RawPerson; body?: string; created?: string }[] }
  }
}

const LIST_FIELDS = [
  "summary", "issuetype", "status", "priority", "assignee", "reporter",
  "created", "updated", "duedate", "resolutiondate", "project", "labels",
]

function requestedFields(custom: CustomFieldIds, extra: string[] = []): string[] {
  return [...LIST_FIELDS, ...extra, ...Object.values(custom).filter((id): id is string => !!id)]
}

function person(raw: RawPerson | null | undefined): Person | null {
  if (!raw) return null
  const id = raw.accountId ?? raw.name
  return id ? { id, name: raw.displayName ?? id } : null
}

function category(key: string | undefined): StatusCategory {
  if (key === "done") return "done"
  if (key === "indeterminate") return "inprogress"
  return "todo"
}

/** Reads a custom field that may be a user, a select option, or a list of either. */
function customPerson(value: unknown): Person | null {
  const v = Array.isArray(value) ? value[0] : value
  if (!v || typeof v !== "object") return null
  const opt = v as RawPerson & { value?: string }
  if (opt.value) return { id: opt.value, name: opt.value }
  return person(opt)
}

function customDate(value: unknown): string | null {
  return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null
}

function customNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function customOption(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v === "string") return v
  if (v && typeof v === "object" && "value" in v && typeof v.value === "string") return v.value
  return null
}

/** The sprint that matters for planning: the active one, else the next future one, else the latest. */
function pickSprint(value: unknown): SprintRef | null {
  if (!Array.isArray(value) || !value.length) return null
  const sprints = (value as RawSprint[]).filter((s) => typeof s?.id === "number")
  const byStart = (a: RawSprint, b: RawSprint) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999")
  const chosen =
    sprints.find((s) => s.state === "active") ??
    sprints.filter((s) => s.state === "future").sort(byStart)[0] ??
    sprints.sort(byStart)[sprints.length - 1]
  if (!chosen) return null
  return {
    id: chosen.id!,
    name: chosen.name ?? `Sprint ${chosen.id}`,
    state: chosen.state ?? "closed",
    start: customDate(chosen.startDate),
    end: customDate(chosen.endDate),
  }
}

function mapDelivery(f: RawIssue["fields"], ids: CustomFieldIds): Delivery {
  const val = (key: keyof CustomFieldIds) => (ids[key] ? f[ids[key]!] : undefined)
  return {
    beDev: customPerson(val("beDev")),
    feDev: customPerson(val("feDev")),
    beStart: customDate(val("beStart")),
    beEnd: customDate(val("beEnd")),
    feStart: customDate(val("feStart")),
    feEnd: customDate(val("feEnd")),
    qaStart: customDate(val("qaStart")),
    qaEnd: customDate(val("qaEnd")),
    beEstimate: customNumber(val("beEstimate")),
    feEstimate: customNumber(val("feEstimate")),
    qaEstimate: customNumber(val("qaEstimate")),
    deployment: customDate(val("deployment")),
    release: customDate(val("release")),
    revisedRelease: customDate(val("revisedRelease")),
    prdSignoff: customOption(val("prdSignoff")),
    spmSignoff: customOption(val("spmSignoff")),
    uatSignoff: customOption(val("uatSignoff")),
    techFeasibility: customOption(val("techFeasibility")),
    qaReview: customOption(val("qaReview")),
    qaReviewPm: customOption(val("qaReviewPm")),
    qaReviewDev: customOption(val("qaReviewDev")),
  }
}

function mapIssue(raw: RawIssue, domain: string, ids: CustomFieldIds): IssueSummary {
  const f = raw.fields ?? {}
  return {
    id: String(raw.id),
    key: raw.key,
    project: f.project?.key ?? raw.key.split("-")[0],
    summary: f.summary ?? "(no summary)",
    type: f.issuetype?.name ?? "Issue",
    status: f.status?.name ?? "Unknown",
    statusId: f.status?.id ?? "",
    statusCategory: category(f.status?.statusCategory?.key),
    priority: f.priority?.name ?? null,
    assignee: person(f.assignee),
    reporter: person(f.reporter),
    created: f.created ?? "",
    updated: f.updated ?? "",
    due: f.duedate ?? null,
    resolved: f.resolutiondate ?? null,
    labels: f.labels ?? [],
    productOwner: ids.productOwner ? customPerson(f[ids.productOwner]) : null,
    sprint: ids.sprint ? pickSprint(f[ids.sprint]) : null,
    sprintIds: ids.sprint && Array.isArray(f[ids.sprint])
      ? (f[ids.sprint] as RawSprint[]).map((s) => s.id).filter((id): id is number => typeof id === "number")
      : [],
    delivery: mapDelivery(f, ids),
    url: `${domain}/browse/${raw.key}`,
  }
}

/* ----------------------------------------------------------------- reading */

export async function searchIssues(ctx: JiraCtx, jql: string, max = 500): Promise<IssueSummary[]> {
  const custom = await customFieldIds(ctx)
  const fields = requestedFields(custom)
  const raw: RawIssue[] = []
  try {
    // Jira Cloud's current search endpoint (token-based paging).
    let nextPageToken: string | undefined
    do {
      const page = await jiraRequest<{ issues?: RawIssue[]; nextPageToken?: string }>(ctx, "/rest/api/3/search/jql", {
        jql,
        fields,
        maxResults: Math.min(100, max - raw.length),
        nextPageToken,
      })
      raw.push(...(page.issues ?? []))
      nextPageToken = page.nextPageToken
    } while (nextPageToken && raw.length < max)
  } catch (err) {
    // Older Jira (Server / Data Center) only has the v2 search endpoint.
    if (!(err instanceof HttpError) || ![404, 405, 410].includes(err.status)) throw err
    let startAt = 0
    let total = Infinity
    while (raw.length < max && startAt < total) {
      const page = await jiraRequest<{ issues: RawIssue[]; total: number }>(ctx, "/rest/api/2/search", {
        jql,
        fields,
        maxResults: Math.min(100, max - raw.length),
        startAt,
      })
      if (!page.issues.length) break
      raw.push(...page.issues)
      total = page.total
      startAt += page.issues.length
    }
  }
  return raw.map((issue) => mapIssue(issue, ctx.domain, custom))
}

export async function getIssueDetail(ctx: JiraCtx, key: string): Promise<IssueDetail> {
  const custom = await customFieldIds(ctx)
  const fields = requestedFields(custom, ["description", "comment"]).join(",")
  const raw = await jiraRequest<RawIssue>(ctx, `/rest/api/2/issue/${key}?fields=${fields}`)
  return {
    ...mapIssue(raw, ctx.domain, custom),
    description: raw.fields.description ?? "",
    comments: (raw.fields.comment?.comments ?? []).map((c) => ({
      id: c.id,
      author: person(c.author),
      body: c.body ?? "",
      created: c.created ?? "",
    })),
  }
}

export async function getMyself(ctx: JiraCtx): Promise<{ name: string; email: string | null }> {
  const me = await jiraRequest<{ displayName?: string; emailAddress?: string }>(ctx, "/rest/api/2/myself")
  return { name: me.displayName ?? "Unknown", email: me.emailAddress ?? null }
}

/* ---------------------------------------------------------- status history */

export interface StatusChange {
  /** ISO timestamp of the change. */
  at: string
  from: string
  to: string
}

/**
 * Status changes for many issues at once, keyed by issue id, oldest first.
 * Uses Jira Cloud's bulk changelog endpoint; on Jira versions without it,
 * returns an empty map and the history-based views say so.
 */
export async function statusHistories(ctx: JiraCtx, issueIds: string[]): Promise<Map<string, StatusChange[]>> {
  const out = new Map<string, StatusChange[]>()
  for (let i = 0; i < issueIds.length; i += 1000) {
    const chunk = issueIds.slice(i, i + 1000)
    let nextPageToken: string | undefined
    do {
      let page: {
        issueChangeLogs?: {
          issueId: string
          changeHistories?: { created: number | string; items?: { fieldId?: string; field?: string; fromString?: string; toString?: string }[] }[]
        }[]
        nextPageToken?: string
      }
      try {
        page = await jiraRequest(ctx, "/rest/api/3/changelog/bulkfetch", {
          issueIdsOrKeys: chunk,
          fieldIds: ["status"],
          maxResults: 1000,
          nextPageToken,
        })
      } catch (err) {
        if (err instanceof HttpError && [404, 405, 410].includes(err.status)) return out
        throw err
      }
      for (const log of page.issueChangeLogs ?? []) {
        const list = out.get(String(log.issueId)) ?? []
        for (const h of log.changeHistories ?? []) {
          const at = new Date(typeof h.created === "number" ? h.created : Date.parse(h.created)).toISOString()
          for (const item of h.items ?? []) {
            if ((item.fieldId ?? item.field) !== "status") continue
            list.push({ at, from: item.fromString ?? "", to: item.toString ?? "" })
          }
        }
        out.set(String(log.issueId), list)
      }
      nextPageToken = page.nextPageToken
    } while (nextPageToken)
  }
  for (const list of out.values()) list.sort((a, b) => a.at.localeCompare(b.at))
  return out
}

/* ---------------------------------------------------------- closed sprints */

export interface SprintInfo {
  id: number
  name: string
  state: string
  start: string | null
  end: string | null
  completed: string | null
}

/** The most recent closed sprints of a project's scrum board (newest last). */
export async function recentClosedSprints(ctx: JiraCtx, project: string, count: number): Promise<SprintInfo[]> {
  const board = await getBoardConfig(ctx, project)
  if (!board) return []
  const all: SprintInfo[] = []
  let startAt = 0
  for (let page = 0; page < 20; page++) {
    const data = await jiraRequest<{
      values?: { id: number; name: string; state: string; startDate?: string; endDate?: string; completeDate?: string }[]
      isLast?: boolean
    }>(ctx, `/rest/agile/1.0/board/${board.boardId}/sprint?state=closed&maxResults=50&startAt=${startAt}`)
    const values = data.values ?? []
    all.push(
      ...values.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        start: customDate(s.startDate),
        end: customDate(s.endDate),
        completed: customDate(s.completeDate),
      }))
    )
    if (data.isLast !== false || !values.length) break
    startAt += values.length
  }
  return all
    .filter((s) => s.completed)
    .sort((a, b) => (a.completed ?? "").localeCompare(b.completed ?? ""))
    .slice(-count)
}

/* ----------------------------------------------------------- board columns */

const boardCache = new Map<string, { at: number; config: Promise<BoardConfig | null> }>()

/**
 * The scrum board's column layout for one project, so the Board page can show
 * the same columns (and column order) people see in Jira.
 */
export function getBoardConfig(ctx: JiraCtx, project: string): Promise<BoardConfig | null> {
  const cacheKey = `${ctx.domain}|${project}`
  const cached = boardCache.get(cacheKey)
  if (cached && Date.now() - cached.at < 3600_000) return cached.config

  const config = (async () => {
    const params = new URLSearchParams({ projectKeyOrId: project, type: "scrum", maxResults: "50" })
    const boards = await jiraRequest<{ values?: { id: number; name: string }[] }>(ctx, `/rest/agile/1.0/board?${params}`)
    const list = boards.values ?? []
    const board = list.find((b) => b.name.trim().toLowerCase() === `${project.toLowerCase()} board`) ?? list[0]
    if (!board) return null
    const data = await jiraRequest<{ columnConfig?: { columns?: { name: string; statuses?: { id: string }[] }[] } }>(
      ctx,
      `/rest/agile/1.0/board/${board.id}/configuration`
    )
    return {
      boardId: board.id,
      boardName: board.name,
      columns: (data.columnConfig?.columns ?? []).map((c) => ({
        name: c.name.trim(),
        statusIds: (c.statuses ?? []).map((s) => String(s.id)),
      })),
    }
  })()
  config.catch(() => boardCache.delete(cacheKey))
  boardCache.set(cacheKey, { at: Date.now(), config })
  return config
}
