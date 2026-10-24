"use client"

import { useCallback, useEffect, useState } from "react"
import { ApiError, apiFetch } from "@/lib/api-client"
import type { IssueScope, IssueSummary } from "@/lib/jira-types"

interface Result {
  requestKey: string
  issues: IssueSummary[]
  error: ApiError | null
}

/**
 * Loads issues for one project ("all" = IGD + ISR + IC) and scope.
 * `loading` is derived from whether the latest result matches the latest
 * request, so switching project or scope never needs a separate loading flag.
 */
export function useIssues(project: string, scope: IssueScope) {
  const [reloadCount, setReloadCount] = useState(0)
  const requestKey = `${project}|${scope}|${reloadCount}`
  const [result, setResult] = useState<Result>({ requestKey: "", issues: [], error: null })

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ project, scope })
    apiFetch<{ issues: IssueSummary[] }>(`/api/issues?${params}`)
      .then((data) => {
        if (!cancelled) setResult({ requestKey, issues: data.issues, error: null })
      })
      .catch((err) => {
        if (!cancelled) {
          const error = err instanceof ApiError ? err : new ApiError(String(err), 0)
          setResult({ requestKey, issues: [], error })
        }
      })
    return () => {
      cancelled = true
    }
  }, [project, scope, requestKey])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  /** Updates one issue in place, e.g. after a change made in the issue panel. */
  const patchIssue = useCallback((key: string, patch: Partial<IssueSummary>) => {
    setResult((r) => ({ ...r, issues: r.issues.map((i) => (i.key === key ? { ...i, ...patch } : i)) }))
  }, [])

  return {
    issues: result.issues,
    error: result.error,
    loading: result.requestKey !== requestKey,
    // True only before the first answer for this project/scope arrives.
    firstLoad: !result.requestKey.startsWith(`${project}|${scope}|`),
    reload,
    patchIssue,
  }
}
