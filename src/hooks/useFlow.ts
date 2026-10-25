"use client"

import { useCallback, useEffect, useState } from "react"
import { ApiError, apiFetch } from "@/lib/api-client"
import type { IssueSummary } from "@/lib/jira-types"
import type { FlowBaseline, IssueFlow } from "@/lib/flow"

export type FlowScope = "sprint" | "next" | "deploy"

interface FlowData {
  issues: IssueSummary[]
  flows: Record<string, IssueFlow>
  baseline: FlowBaseline | null
}

/** Issues plus their real status history and the typical phase times to compare against. */
export function useFlow(project: string, scope: FlowScope) {
  const [reloadCount, setReloadCount] = useState(0)
  const requestKey = `${project}|${scope}|${reloadCount}`
  const [result, setResult] = useState<{ requestKey: string; data: FlowData | null; error: ApiError | null }>({
    requestKey: "",
    data: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    apiFetch<FlowData>(`/api/flow?${new URLSearchParams({ project, scope })}`)
      .then((data) => {
        if (!cancelled) setResult({ requestKey, data, error: null })
      })
      .catch((err) => {
        if (!cancelled) setResult({ requestKey, data: null, error: err instanceof ApiError ? err : new ApiError(String(err), 0) })
      })
    return () => {
      cancelled = true
    }
  }, [project, scope, requestKey])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  return {
    issues: result.data?.issues ?? [],
    flows: result.data?.flows ?? {},
    baseline: result.data?.baseline ?? null,
    error: result.error,
    loading: result.requestKey !== requestKey,
    firstLoad: !result.requestKey.startsWith(`${project}|${scope}|`),
    reload,
  }
}
