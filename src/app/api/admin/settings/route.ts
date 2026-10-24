import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireAdmin } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { getJiraDomain, normalizeDomain } from "@/lib/jira"

export const dynamic = "force-dynamic"

export const GET = handler(async () => {
  await requireAdmin()
  return NextResponse.json({ jiraDomain: await getJiraDomain() })
})

/** Body: { jiraDomain }, e.g. "your-company.atlassian.net". */
export const PUT = handler(async (req: Request) => {
  await requireAdmin()
  const raw = str((await readJson(req)).jiraDomain)
  if (!raw) throw new HttpError(400, "Enter your Jira site address.")

  const domain = normalizeDomain(raw)
  let url: URL
  try {
    url = new URL(domain)
  } catch {
    throw new HttpError(400, "That doesn't look like a web address.")
  }
  if (url.protocol !== "https:") throw new HttpError(400, "The Jira address must use https.")

  const jiraDomain = url.origin
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { jiraDomain },
    create: { id: 1, jiraDomain },
  })
  return NextResponse.json({ jiraDomain })
})
