import { Eye } from "lucide-react"

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-mint rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Eye className="w-6 h-6 text-gray-dark" />
        </div>
        <p className="text-gray text-sm">Loading...</p>
      </div>
    </div>
  )
}
