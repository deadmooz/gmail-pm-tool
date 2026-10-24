import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { ISSUE_KEY_RE } from "@/lib/jira-types"

/**
 * Body: { issueKey, accountId | null, name? }. Records who tests a card.
 * Stored in PM Board only; Jira is not changed.
 */
export const PUT = handler(async (req: Request) => {
  await requireUser()
  const body = await readJson(req)
  const issueKey = str(body.issueKey).toUpperCase()
  if (!ISSUE_KEY_RE.test(issueKey)) throw new HttpError(400, "Only IGD, ISR and IC issues can have QA assigned here.")

  if (body.accountId === null || body.accountId === "") {
    await prisma.qaAssignment.deleteMany({ where: { issueKey } })
    return NextResponse.json({ ok: true })
  }

  const accountId = str(body.accountId)
  const name = str(body.name)
  if (!accountId || !name) throw new HttpError(400, "Pick a QA person.")
  await prisma.qaAssignment.upsert({
    where: { issueKey },
    update: { accountId, name },
    create: { issueKey, accountId, name },
  })
  return NextResponse.json({ ok: true })
})
