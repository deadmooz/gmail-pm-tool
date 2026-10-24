import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { addComment, jiraContext } from "@/lib/jira"
import { issueKeyFrom, type IssueRouteCtx } from "@/lib/issue-route"

export const POST = handler(async (req: Request, ctx: IssueRouteCtx) => {
  const user = await requireUser()
  const key = await issueKeyFrom(ctx)
  const body = str((await readJson(req)).body)
  if (!body) throw new HttpError(400, "Write a comment first.")
  if (body.length > 10000) throw new HttpError(400, "That comment is too long.")
  await addComment(await jiraContext(user), key, body)
  return NextResponse.json({ ok: true })
})
