import { redirect } from "next/navigation"

// Stack Auth disabled for React 19 compatibility
export default function Handler() {
  redirect("/pages/dashboard")
}
