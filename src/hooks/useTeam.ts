"use client"

import { useCallback, useEffect, useState } from "react"
import { ApiError, apiFetch } from "@/lib/api-client"
import type { TeamData } from "@/lib/team-types"

/** Loads PM Board's own planning data (roles, calendar, holidays, leave, QA assignments). */
export function useTeam() {
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState<{ count: number; team: TeamData | null; error: ApiError | null }>({
    count: -1,
    team: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    apiFetch<TeamData>("/api/team")
      .then((team) => {
        if (!cancelled) setResult({ count: reloadCount, team, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          setResult((r) => ({ ...r, count: reloadCount, error: err instanceof ApiError ? err : new ApiError(String(err), 0) }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [reloadCount])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  return { team: result.team, error: result.error, loading: result.count !== reloadCount, reload }
}
