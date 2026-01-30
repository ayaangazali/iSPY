import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsWidgetProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: string
    isPositive: boolean
  }
  className?: string
}

export function StatsWidget({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  className 
}: StatsWidgetProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/50 to-slate-800/30 p-6 backdrop-blur-sm transition-all hover:border-slate-700 hover:shadow-xl",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {trend && (
            <p className={cn(
              "text-xs font-semibold",
              trend.isPositive ? "text-green-400" : "text-red-400"
            )}>
              {trend.isPositive ? "↑" : "↓"} {trend.value}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-slate-800/50 p-3">
          <Icon className="h-6 w-6 text-blue-400" />
        </div>
      </div>
      
      {/* Decorative gradient */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl" />
    </div>
  )
}
