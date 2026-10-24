import { getServerSession } from "next-auth/next"
import type { User } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { HttpError } from "@/lib/http"

/**
 * The signed-in user, re-read from the database on every call so that a
 * suspended or deleted user loses access immediately, not when their JWT expires.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  return user && user.status === "active" ? user : null
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new HttpError(401, "Please sign in again.", "SIGNED_OUT")
  return user
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser()
  if (user.role !== "admin") throw new HttpError(403, "Only admins can do that.")
  return user
}

/** User fields that are safe to send to the browser. */
export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    jiraEmail: user.jiraEmail,
    jiraConnected: Boolean(user.jiraEmail && user.jiraApiToken),
    createdAt: user.createdAt.toISOString(),
  }
}

export type PublicUser = ReturnType<typeof publicUser>
