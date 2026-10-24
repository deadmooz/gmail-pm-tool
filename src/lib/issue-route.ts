import { HttpError } from "@/lib/http"
import { ISSUE_KEY_RE } from "@/lib/jira-types"

export type IssueRouteCtx = { params: Promise<{ key: string }> }

/** Reads the issue key from the route and rejects anything outside IGD / ISR / IC. */
export async function issueKeyFrom(ctx: IssueRouteCtx): Promise<string> {
  const key = (await ctx.params).key.toUpperCase()
  if (!ISSUE_KEY_RE.test(key)) throw new HttpError(400, "Only IGD, ISR and IC issues are available here.")
  return key
}
