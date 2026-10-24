import { NextResponse } from "next/server"

/** An error that should reach the client with a specific status and message. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
  }
  console.error(err)
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 })
}

/** Wraps a route handler so thrown HttpErrors become JSON responses. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === "object" ? body : {}
  } catch {
    return {}
  }
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
