import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getTransitions, jiraContext, transitionIssue } from "@/lib/jira"
import { issueKeyFrom, type IssueRouteCtx } from "@/lib/issue-route"

export const dynamic = "force-dynamic"

export const GET = handler(async (_req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const transitions = await getTransitions(await jiraContext(user), key)
  return NextResponse.json({ transitions })
})

/** Body: { transitionId }. Moves the issue to that transition's target status. */
export const POST = handler(async (req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const transitionId = str((await readJson(req)).transitionId)
  if (!/^\d+$/.test(transitionId)) throw new HttpError(400, "Invalid transition.")
  await transitionIssue(await jiraContext(user), key, transitionId)
  return NextResponse.json({ ok: true })
})
