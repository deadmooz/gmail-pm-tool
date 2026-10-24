export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
  }
}

/** fetch() for this app's own API: JSON in, JSON out, and a readable error on failure. */
export async function apiFetch<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    })
  } catch {
    throw new ApiError("Can't reach the server. Is it still running?", 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && data?.code === "SIGNED_OUT") {
      // Session ended (signed out or suspended): a full reload clears every page's state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login"
    }
    throw new ApiError(data?.error ?? `Request failed (${res.status}).`, res.status, data?.code)
  }
  return data as T
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong."
}
