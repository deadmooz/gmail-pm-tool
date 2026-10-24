"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api-client"
import type { BoardConfig } from "@/lib/jira-types"

let boardsPromise: Promise<Record<string, BoardConfig | null>> | null = null

/** Each project's Jira scrum board columns. Loaded once per page session. */
export function useBoards() {
  const [boards, setBoards] = useState<Record<string, BoardConfig | null> | null>(null)
  useEffect(() => {
    boardsPromise ??= apiFetch<{ boards: Record<string, BoardConfig | null> }>("/api/jira/boards")
      .then((d) => d.boards)
      .catch(() => {
        boardsPromise = null
        return {}
      })
    let cancelled = false
    boardsPromise.then((b) => {
      if (!cancelled) setBoards(b)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return boards
}
