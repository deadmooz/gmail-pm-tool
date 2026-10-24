import type { User } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { HttpError } from "@/lib/http"
import type {
  IssueDetail,
  IssueSummary,
  IssueTransition,
  Person,
  StatusCategory,
} from "@/lib/jira-types"

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

/* ------------------------------------------------------- custom field lookup */

// Custom fields have per-site ids (e.g. customfield_10031), so they are found by
// name once per Jira site and cached for an hour.
const fieldCache = new Map<string, { at: number; ids: Promise<CustomFieldIds> }>()

interface CustomFieldIds {
  productOwner: string | null
}

export function customFieldIds(ctx: JiraCtx): Promise<CustomFieldIds> {
  const cached = fieldCache.get(ctx.domain)
  if (cached && Date.now() - cached.at < 3600_000) return cached.ids
  const ids = jiraRequest<{ id: string; name: string }[]>(ctx, "/rest/api/2/field").then((fields) => ({
    productOwner: fields.find((f) => f.name.trim().toLowerCase() === "product owner")?.id ?? null,
  }))
  ids.catch(() => fieldCache.delete(ctx.domain))
  fieldCache.set(ctx.domain, { at: Date.now(), ids })
  return ids
}

export async function jiraRequest<T>(
  ctx: JiraCtx,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch(ctx.domain + path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: ctx.auth,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new HttpError(502, "Couldn't reach Jira. Check the Jira site address and your network.")
  }

  if (res.status === 204) return undefined as T
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
      throw new HttpError(403, jiraErrorMessage(data) ?? "Your Jira account doesn't have permission to do that.")
    }
    const message = jiraErrorMessage(data) ?? `Jira returned an error (${res.status}).`
    throw new HttpError(res.status >= 500 ? 502 : res.status, message)
  }
  return data as T
}

/* ------------------------------------------------------------------ mapping */

interface RawPerson {
  accountId?: string
  name?: string
  displayName?: string
}

interface RawStatus {
  name?: string
  statusCategory?: { key?: string }
}

interface RawIssue {
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

interface RawTransition {
  id: string
  name: string
  to?: RawStatus
}

const LIST_FIELDS = [
  "summary", "issuetype", "status", "priority", "assignee", "reporter",
  "created", "updated", "duedate", "resolutiondate", "project", "labels",
]

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

function mapIssue(raw: RawIssue, domain: string, fields: CustomFieldIds): IssueSummary {
  const f = raw.fields ?? {}
  return {
    key: raw.key,
    project: f.project?.key ?? raw.key.split("-")[0],
    summary: f.summary ?? "(no summary)",
    type: f.issuetype?.name ?? "Issue",
    status: f.status?.name ?? "Unknown",
    statusCategory: category(f.status?.statusCategory?.key),
    priority: f.priority?.name ?? null,
    assignee: person(f.assignee),
    reporter: person(f.reporter),
    created: f.created ?? "",
    updated: f.updated ?? "",
    due: f.duedate ?? null,
    resolved: f.resolutiondate ?? null,
    labels: f.labels ?? [],
    productOwner: fields.productOwner ? customPerson(f[fields.productOwner]) : null,
    url: `${domain}/browse/${raw.key}`,
  }
}

function mapTransition(t: RawTransition): IssueTransition {
  return { id: t.id, name: t.name, to: t.to?.name ?? t.name, toCategory: category(t.to?.statusCategory?.key) }
}

/* ----------------------------------------------------------------- reading */

export async function searchIssues(ctx: JiraCtx, jql: string, max = 500): Promise<IssueSummary[]> {
  const custom = await customFieldIds(ctx)
  const fields = [...LIST_FIELDS, ...(custom.productOwner ? [custom.productOwner] : [])]
  const raw: RawIssue[] = []
  try {
    // Jira Cloud's current search endpoint (token-based paging).
    let nextPageToken: string | undefined
    do {
      const page = await jiraRequest<{ issues?: RawIssue[]; nextPageToken?: string }>(ctx, "/rest/api/3/search/jql", {
        method: "POST",
        body: { jql, fields, maxResults: Math.min(100, max - raw.length), nextPageToken },
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
        method: "POST",
        body: { jql, fields, maxResults: Math.min(100, max - raw.length), startAt },
      })
      if (!page.issues.length) break
      raw.push(...page.issues)
      total = page.total
      startAt += page.issues.length
    }
  }
  return raw.map((issue) => mapIssue(issue, ctx.domain, custom))
}

export async function getTransitions(ctx: JiraCtx, key: string): Promise<IssueTransition[]> {
  const data = await jiraRequest<{ transitions?: RawTransition[] }>(ctx, `/rest/api/2/issue/${key}/transitions`)
  return (data.transitions ?? []).map(mapTransition)
}

export async function getIssueDetail(ctx: JiraCtx, key: string): Promise<IssueDetail> {
  const custom = await customFieldIds(ctx)
  const fields = [...LIST_FIELDS, "description", "comment", ...(custom.productOwner ? [custom.productOwner] : [])].join(",")
  const [raw, transitions] = await Promise.all([
    jiraRequest<RawIssue>(ctx, `/rest/api/2/issue/${key}?fields=${fields}`),
    getTransitions(ctx, key),
  ])
  return {
    ...mapIssue(raw, ctx.domain, custom),
    description: raw.fields.description ?? "",
    comments: (raw.fields.comment?.comments ?? []).map((c) => ({
      id: c.id,
      author: person(c.author),
      body: c.body ?? "",
      created: c.created ?? "",
    })),
    transitions,
  }
}

export async function searchAssignable(ctx: JiraCtx, key: string, query: string): Promise<Person[]> {
  const params = new URLSearchParams({ issueKey: key, query, maxResults: "20" })
  const users = await jiraRequest<RawPerson[]>(ctx, `/rest/api/2/user/assignable/search?${params}`)
  return users.map(person).filter((p): p is Person => p !== null)
}

export async function getPriorities(ctx: JiraCtx): Promise<string[]> {
  const list = await jiraRequest<{ name: string }[]>(ctx, "/rest/api/2/priority")
  return list.map((p) => p.name)
}

export async function getMyself(ctx: JiraCtx): Promise<{ name: string; email: string | null }> {
  const me = await jiraRequest<{ displayName?: string; emailAddress?: string }>(ctx, "/rest/api/2/myself")
  return { name: me.displayName ?? "Unknown", email: me.emailAddress ?? null }
}

/* ----------------------------------------------------------------- writing */

export async function transitionIssue(ctx: JiraCtx, key: string, transitionId: string) {
  await jiraRequest(ctx, `/rest/api/2/issue/${key}/transitions`, {
    method: "POST",
    body: { transition: { id: transitionId } },
  })
}

export async function setAssignee(ctx: JiraCtx, key: string, accountId: string | null) {
  await jiraRequest(ctx, `/rest/api/2/issue/${key}/assignee`, { method: "PUT", body: { accountId } })
}

export async function setPriority(ctx: JiraCtx, key: string, priority: string) {
  await jiraRequest(ctx, `/rest/api/2/issue/${key}`, {
    method: "PUT",
    body: { fields: { priority: { name: priority } } },
  })
}

export async function addComment(ctx: JiraCtx, key: string, body: string) {
  await jiraRequest(ctx, `/rest/api/2/issue/${key}/comment`, { method: "POST", body: { body } })
}
