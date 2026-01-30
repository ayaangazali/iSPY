"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Trash2, Search, Video, Clock, Eye } from "lucide-react"
import { Input } from "@/components/ui/input"
import { DashboardLayout } from "@/components/dashboard-layout"

interface SavedVideo {
  id: string
  name: string
  url: string
  thumbnailUrl: string
  timestamps: { timestamp: string; description: string }[]
}

export default function SavedVideosPage() {
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredVideos, setFilteredVideos] = useState<SavedVideo[]>([])

  useEffect(() => {
    const existing = JSON.parse(localStorage.getItem("savedVideos") || "[]")

    if (!existing || existing.length === 0) {
      const demoSeed: SavedVideo[] = [
        {
          id: "demo-1",
          name: "Front Entrance Monitor",
          url: "/videos/Robbery1.mp4",
          thumbnailUrl: "/cat1.png",
          timestamps: [
            { timestamp: "00:15", description: "Person loitering near entrance" },
            { timestamp: "02:30", description: "Unauthorized access attempt" },
            { timestamp: "05:45", description: "Normal foot traffic" },
            { timestamp: "08:20", description: "Suspicious package left" },
          ],
        },
      ]
      localStorage.setItem("savedVideos", JSON.stringify(demoSeed))
      setSavedVideos(demoSeed)
      setFilteredVideos(demoSeed)
    } else {
      setSavedVideos(existing)
      setFilteredVideos(existing)
    }
  }, [])

  useEffect(() => {
    const filtered = savedVideos.filter(
      (video) =>
        video.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        video.timestamps.some((ts) => ts.description.toLowerCase().includes(searchTerm.toLowerCase())),
    )
    setFilteredVideos(filtered)
  }, [searchTerm, savedVideos])

  const handleDelete = (id: string) => {
    const updated = savedVideos.filter((v) => v.id !== id)
    setSavedVideos(updated)
    localStorage.setItem("savedVideos", JSON.stringify(updated))
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Saved Videos</h1>
          <p className="text-gray text-sm">{savedVideos.length} videos in your library</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray" />
          <Input
            type="text"
            placeholder="Search videos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray/50"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              className="group bg-[#111] border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-colors"
            >
              <div className="aspect-video bg-black relative overflow-hidden">
                <video
                  src={video.url}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  muted
                  playsInline
                />
                <div className="absolute top-3 right-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-lg">
                    <Video className="w-3 h-3 text-mint" />
                    <span className="text-xs text-white">{video.timestamps.length}</span>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <h2 className="text-white font-medium mb-2 truncate">{video.name}</h2>
                <div className="flex items-center gap-2 mb-4 text-gray text-xs">
                  <Clock className="w-3 h-3" />
                  <span>{video.timestamps.length} key moments</span>
                </div>
                <div className="flex gap-2">
                  <Link href={`/pages/video/${video.id}`} className="flex-1">
                    <button className="w-full py-2.5 bg-mint text-gray-dark text-sm font-medium rounded-lg hover:bg-mint-light transition-colors flex items-center justify-center gap-2">
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </Link>
                  <button
                    onClick={() => handleDelete(video.id)}
                    className="p-2.5 bg-coral/10 hover:bg-coral/20 text-coral rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredVideos.length === 0 && (
          <div className="text-center py-12">
            <Video className="w-12 h-12 text-gray/30 mx-auto mb-4" />
            <p className="text-gray">
              {searchTerm ? "No videos match your search" : "No saved videos yet"}
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
