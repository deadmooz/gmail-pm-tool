import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { publicUser, requireUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { encryptSecret } from "@/lib/crypto"

/** Body: { jiraEmail, jiraApiToken? }. A blank token keeps the one already saved. */
export const PUT = handler(async (req: Request) => {
  const user = await requireUser()
  const body = await readJson(req)
  const jiraEmail = str(body.jiraEmail).toLowerCase()
  const token = str(body.jiraApiToken)

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(jiraEmail)) throw new HttpError(400, "Enter the email you use to sign in to Jira.")
  if (!token && !user.jiraApiToken) throw new HttpError(400, "Paste your Jira API token.")

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { jiraEmail, ...(token ? { jiraApiToken: encryptSecret(token) } : {}) },
  })
  return NextResponse.json({ user: publicUser(updated) })
})

export const DELETE = handler(async () => {
  const user = await requireUser()
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { jiraEmail: null, jiraApiToken: null },
  })
  return NextResponse.json({ user: publicUser(updated) })
})
