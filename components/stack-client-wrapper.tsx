"use client"

import { ReactNode } from "react"

// Stack Auth disabled for React 19 compatibility
export default function StackClientWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}
