"use client"

import { ReactNode } from "react"
import HomeLink from "@/components/home-link"
import { HeaderNav } from "@/components/header-nav"
import HeaderAuth from "@/components/header-auth"
import { GeminiFooter } from "@/components/gemini-footer"

interface SimpleLayoutProps {
  children: ReactNode
}

export function SimpleLayout({ children }: SimpleLayoutProps) {
  return (
    <main className="min-h-screen flex flex-col items-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-slate-800 h-16 bg-slate-950/50 backdrop-blur-sm">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex items-center gap-8">
              <HomeLink />
              <HeaderNav />
            </div>
            <HeaderAuth />
          </div>
        </nav>
        <div className="w-full">
          {children}
        </div>
        <footer className="w-full border-t border-t-slate-800 p-8 flex justify-center bg-slate-950/50">
          <GeminiFooter />
        </footer>
      </div>
    </main>
  )
}
