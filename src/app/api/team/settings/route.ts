import { NextResponse } from "next/server"
import { handler, HttpError, readJson } from "@/lib/http"
import { requireAdmin } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { getTeamSettings } from "@/lib/team"

function percent(value: unknown, label: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 90) throw new HttpError(400, `${label} bug buffer must be a whole number from 0 to 90.`)
  return n
}

/** Body: { defaultHoursPerDay, saturdaysOff: number[], bugBuffer: { BE, FE, QA } }. */
export const PUT = handler(async (req: Request) => {
  await requireAdmin()
  const body = await readJson(req)

  const hours = Number(body.defaultHoursPerDay)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 16) throw new HttpError(400, "Hours per day must be between 0 and 16.")

  const sats = Array.isArray(body.saturdaysOff) ? body.saturdaysOff.map(Number) : []
  if (sats.some((n: number) => !Number.isInteger(n) || n < 1 || n > 5)) throw new HttpError(400, "Invalid Saturday selection.")

  const buffer = (body.bugBuffer ?? {}) as Record<string, unknown>
  const data = {
    defaultHoursPerDay: hours,
    saturdaysOff: [...new Set<number>(sats)].sort().join(","),
    bugBufferBE: percent(buffer.BE, "Back-end"),
    bugBufferFE: percent(buffer.FE, "Front-end"),
    bugBufferQA: percent(buffer.QA, "QA"),
  }
  await prisma.appSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
  return NextResponse.json({ settings: await getTeamSettings() })
})
