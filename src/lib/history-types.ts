// Shared between server and browser.

export interface SprintStat {
  id: number
  name: string
  project: string
  start: string | null
  end: string | null
  completed: string | null
  /** Issues that were in the sprint. */
  committed: number
  /** Finished by the time the sprint closed. */
  done: number
  /** Not finished and moved into a later sprint. */
  carriedOver: number
  notDone: number
  bugs: number
  /** Sum of back-end + front-end + QA estimates, in hours. */
  plannedHours: number
  doneHours: number
  /** Median of actual ÷ planned days for development (1.0 = on plan, 1.5 = took 50% longer). */
  devAccuracy: number | null
  /** Same for QA. */
  qaAccuracy: number | null
  accuracySample: { dev: number; qa: number }
  /** Percent of the sprint's issues sent back from QA to development at least once. */
  bounceRate: number
}
