import { NextResponse } from "next/server"
import { handler, HttpError, readJson, str } from "@/lib/http"
import { publicUser, requireAdmin } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password"

export const dynamic = "force-dynamic"

const ROLES = ["admin", "member"]

export const GET = handler(async () => {
  await requireAdmin()
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
  return NextResponse.json({ users: users.map(publicUser) })
})

/** Body: { name, email, password, role }. */
export const POST = handler(async (req: Request) => {
  await requireAdmin()
  const body = await readJson(req)
  const name = str(body.name)
  const email = str(body.email).toLowerCase()
  const password = typeof body.password === "string" ? body.password : ""
  const role = str(body.role) || "member"

  if (!name) throw new HttpError(400, "Enter a name.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email.")
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (!ROLES.includes(role)) throw new HttpError(400, "Invalid role.")
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "A user with that email already exists.")

  const user = await prisma.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
  })
  return NextResponse.json({ user: publicUser(user) }, { status: 201 })
})
