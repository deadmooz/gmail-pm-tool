import { NextResponse } from "next/server"
import { handler, HttpError, readJson } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getIssueDetail, jiraContext, setAssignee, setPriority } from "@/lib/jira"
import { issueKeyFrom, type IssueRouteCtx } from "@/lib/issue-route"

export const dynamic = "force-dynamic"

export const GET = handler(async (_req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const issue = await getIssueDetail(await jiraContext(user), key)
  return NextResponse.json({ issue })
})

/** Body: { assignee?: accountId | null, priority?: string }. Only the fields present are changed. */
export const PATCH = handler(async (req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const body = await readJson(req)
  const jira = await jiraContext(user)

  if (!("assignee" in body) && !("priority" in body)) {
    throw new HttpError(400, "Nothing to change.")
  }
  if ("assignee" in body) {
    if (body.assignee !== null && typeof body.assignee !== "string") throw new HttpError(400, "Invalid assignee.")
    await setAssignee(jira, key, body.assignee)
  }
  if ("priority" in body) {
    if (typeof body.priority !== "string" || !body.priority) throw new HttpError(400, "Invalid priority.")
    await setPriority(jira, key, body.priority)
  }
  return NextResponse.json({ ok: true })
})
