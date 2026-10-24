import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { requireAdmin } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { isIsoDate } from "@/lib/team"

/** Body: { date: "YYYY-MM-DD", name }. */
export const POST = handler(async (req: Request) => {
  await requireAdmin()
  const body = await readJson(req)
  const name = str(body.name)
  if (!isIsoDate(body.date)) throw new HttpError(400, "Pick a date.")
  if (!name) throw new HttpError(400, "Name the holiday.")
  const holiday = await prisma.holiday.upsert({
    where: { date: body.date },
    update: { name },
    create: { date: body.date, name },
  })
  return NextResponse.json({ holiday })
})

export const DELETE = handler(async (req: Request) => {
  await requireAdmin()
  const date = new URL(req.url).searchParams.get("date") ?? ""
  await prisma.holiday.deleteMany({ where: { date } })
  return NextResponse.json({ ok: true })
})
