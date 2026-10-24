import { NextResponse } from "next/server"
import { handler } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { jiraContext, searchAssignable } from "@/lib/jira"
import { issueKeyFrom, type IssueRouteCtx } from "@/lib/issue-route"

export const dynamic = "force-dynamic"

export const GET = handler(async (req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const query = (new URL(req.url).searchParams.get("query") ?? "").slice(0, 100)
  const users = await searchAssignable(await jiraContext(user), key, query)
  return NextResponse.json({ users })
})
