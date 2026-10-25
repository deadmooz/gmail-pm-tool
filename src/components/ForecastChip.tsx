import { FORECAST_LABEL, type Forecast } from "@/lib/flow"
import { cn } from "@/lib/utils"
import { fmtDate } from "@/components/ui-kit"

const STYLE: Record<Forecast["status"], string> = {
  done: "bg-emerald-50 text-emerald-700",
  "on-track": "bg-emerald-50 text-emerald-700",
  "at-risk": "bg-amber-50 text-amber-800",
  "will-slip": "bg-red-50 text-red-700",
  late: "bg-red-100 text-red-800",
  "no-date": "bg-slate-100 text-slate-500",
}

/** Deployment forecast as a small coloured label, with the predicted finish in the tooltip. */
export function ForecastChip({ forecast }: { forecast: Forecast }) {
  const title =
    forecast.predicted
      ? `Likely done around ${fmtDate(forecast.predicted)}, based on typical time per phase`
      : forecast.status === "late"
        ? `Deployment date passed ${forecast.slipDays}d ago`
        : undefined
  return (
    <span title={title} className={cn("whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold", STYLE[forecast.status])}>
      {FORECAST_LABEL[forecast.status]}
      {forecast.status === "will-slip" && forecast.slipDays !== null && ` +${forecast.slipDays}d`}
    </span>
  )
}
