"use client"

import { ReactNode } from "react"
import { DashboardSidebar } from "./dashboard-sidebar"
import { DashboardHeader } from "./dashboard-header"

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-dark text-white relative selection:bg-mint/30 selection:text-mint-light">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-mint/5 via-gray-dark to-gray-dark pointer-events-none" />
      <DashboardSidebar />
      <div className="lg:pl-64 relative z-10">
        <DashboardHeader />
        <main className="p-6 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
