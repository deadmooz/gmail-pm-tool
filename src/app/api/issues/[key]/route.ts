import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { getIssueDetail, jiraContext } from "@/lib/jira"
import { issueKeyFrom, type IssueRouteCtx } from "@/lib/issue-route"

export const dynamic = "force-dynamic"

export const GET = handler(async (_req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const issue = await getIssueDetail(await jiraContext(user), key)
  return NextResponse.json({ issue })
})
