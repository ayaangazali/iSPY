"use client"

import { DashboardLayout } from "@/components/dashboard-layout"
import {
  Video,
  Activity,
  AlertTriangle,
  Clock,
  Play,
  Camera,
  TrendingUp,
  Shield,
  Eye,
  RefreshCw,
  ArrowRight
} from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [recentEvents] = useState([
    {
      title: "Suspicious Activity",
      description: "Motion detected in Zone A",
      timestamp: "2 min ago",
      type: "alert" as const,
    },
    {
      title: "Safety Alert",
      description: "PPE violation in Zone B",
      timestamp: "5 min ago",
      type: "warning" as const,
    },
    {
      title: "Camera Online",
      description: "Zone C reconnected",
      timestamp: "10 min ago",
      type: "success" as const,
    },
  ])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Security Monitor</h1>
            <p className="text-gray text-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-mint rounded-full animate-pulse" />
              Real-time tracking active
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray">
              {currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] rounded-xl p-5 border border-white/10 hover:border-mint/20 transition-all duration-300 hover:scale-[1.02] shadow-lg group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide font-medium">Cameras</span>
              <Video className="w-4 h-4 text-mint group-hover:scale-110 transition-transform duration-300" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">8</div>
            <div className="text-mint text-xs mt-1 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3 h-3" />
              All online
            </div>
          </div>

          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] rounded-xl p-5 border border-white/10 hover:border-mint/20 transition-all duration-300 hover:scale-[1.02] shadow-lg group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide font-medium">Incidents</span>
              <Activity className="w-4 h-4 text-gray group-hover:text-mint transition-colors duration-300" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">1,250</div>
            <div className="text-gray text-xs mt-1 font-medium">This month</div>
          </div>

          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] rounded-xl p-5 border border-white/10 hover:border-coral/20 transition-all duration-300 hover:scale-[1.02] shadow-lg group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide font-medium">Alerts</span>
              <AlertTriangle className="w-4 h-4 text-coral group-hover:scale-110 transition-transform duration-300" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">4</div>
            <div className="text-coral text-xs mt-1 font-medium">Needs attention</div>
          </div>

          <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] rounded-xl p-5 border border-white/10 hover:border-mint/20 transition-all duration-300 hover:scale-[1.02] shadow-lg group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide font-medium">Response</span>
              <Clock className="w-4 h-4 text-gray group-hover:text-mint transition-colors duration-300" />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">2.3s</div>
            <div className="text-gray text-xs mt-1 font-medium">Average</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Video Feeds */}
          <div className="lg:col-span-2 space-y-4">
            {/* Primary Feed */}
            <div className="bg-[#111] rounded-xl border border-white/5 overflow-hidden shadow-2xl ring-1 ring-white/10 relative group">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02] backdrop-blur-sm absolute top-0 left-0 right-0 z-10 transition-transform duration-300 -translate-y-full group-hover:translate-y-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-mint rounded-full animate-pulse shadow-[0_0_10px_rgba(77,255,188,0.5)]" />
                  <span className="text-white text-sm font-medium drop-shadow-md">Zone A - Main Entrance</span>
                </div>
                <Link href="/pages/realtimeStreamPage">
                  <button className="px-3 py-1.5 bg-mint/90 backdrop-blur-sm text-gray-dark text-xs font-medium rounded-lg hover:bg-mint transition-colors flex items-center gap-1 shadow-lg">
                    <Play className="w-3 h-3" />
                    Live
                  </button>
                </Link>
              </div>
              <div className="aspect-video bg-black relative">
                <video 
                  src="/videos/Robbery1.mp4" 
                  autoPlay 
                  loop 
                  muted
                  playsInline
                  className="w-full h-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
                />
                {/* Always visible live indicator when header is hidden */}
                <div className="absolute top-4 left-4 flex items-center gap-2 group-hover:opacity-0 transition-opacity duration-300">
                  <div className="px-2 py-1 bg-black/50 backdrop-blur-md rounded-md border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 bg-coral rounded-full animate-pulse" />
                    <span className="text-xs text-white font-medium">LIVE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Feeds */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { zone: 'Zone B', video: '/videos/Shoplifting1.mp4' },
                { zone: 'Zone C', video: '/videos/Fighting1.mp4' },
                { zone: 'Zone D', video: '/videos/Vandalism3.mp4' }
              ].map((item, i) => (
                <div key={i} className="bg-[#111] rounded-lg border border-white/5 overflow-hidden group cursor-pointer hover:ring-1 hover:ring-mint/50 transition-all duration-300 hover:shadow-lg hover:shadow-mint/5">
                  <div className="aspect-video bg-black relative">
                    <video 
                      src={item.video} 
                      autoPlay 
                      loop 
                      muted
                      playsInline
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute top-2 left-2">
                      <div className="flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs text-white">
                        <div className="w-1.5 h-1.5 bg-mint rounded-full" />
                        Live
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs text-gray">{item.zone}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Camera Status */}
            <div className="bg-[#111] rounded-xl border border-white/5 p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <span className="text-white font-medium">Camera Status</span>
                <Link href="/pages/saved-videos" className="text-mint text-xs hover:underline flex items-center gap-1 transition-all hover:gap-2">
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {['Zone A - Main Entrance', 'Zone B - Storage', 'Zone C - Office', 'Zone D - Parking'].map((zone, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg hover:bg-white/[0.04] transition-colors border border-transparent hover:border-white/5 group">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-mint rounded-full shadow-[0_0_8px_rgba(77,255,188,0.4)]" />
                      <span className="text-sm text-white group-hover:translate-x-1 transition-transform duration-200">{zone}</span>
                    </div>
                    <span className="text-xs text-gray">{12 - i * 2} incidents</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="space-y-4">
            {/* Recent Activity */}
            <div className="bg-[#111] rounded-xl border border-white/5 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-gray" />
                <span className="text-white font-medium">Recent Activity</span>
              </div>
              <div className="space-y-3">
                {recentEvents.map((event, i) => (
                  <div 
                    key={i} 
                    className={`p-3 rounded-lg border transition-all duration-300 hover:scale-[1.02] ${
                      event.type === 'alert' ? 'bg-coral/5 border-coral/20 hover:bg-coral/10 hover:shadow-[0_0_15px_-5px_rgba(255,77,77,0.3)]' :
                      event.type === 'warning' ? 'bg-[#FFB84D]/5 border-[#FFB84D]/20 hover:bg-[#FFB84D]/10 hover:shadow-[0_0_15px_-5px_rgba(255,184,77,0.3)]' :
                      'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 ${
                        event.type === 'alert' ? 'text-coral' :
                        event.type === 'warning' ? 'text-[#FFB84D]' :
                        'text-mint'
                      }`}>
                        {event.type === 'alert' && <AlertTriangle className="w-4 h-4" />}
                        {event.type === 'warning' && <AlertTriangle className="w-4 h-4" />}
                        {event.type === 'success' && <Shield className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{event.title}</p>
                        <p className="text-xs text-gray mt-0.5">{event.description}</p>
                        <p className="text-xs text-gray/50 mt-1">{event.timestamp}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-mint/10 border border-mint/20 rounded-xl p-5">
              <h3 className="text-white font-medium mb-1">System Status</h3>
              <p className="text-mint text-sm mb-4">All systems operational</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/pages/statistics">
                  <button className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-center">
                    <TrendingUp className="w-5 h-5 text-mint mx-auto mb-1" />
                    <p className="text-xs text-gray">Analytics</p>
                  </button>
                </Link>
                <Link href="/pages/saved-videos">
                  <button className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-center">
                    <Video className="w-5 h-5 text-gray mx-auto mb-1" />
                    <p className="text-xs text-gray">Videos</p>
                  </button>
                </Link>
                <Link href="/pages/upload">
                  <button className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-center">
                    <Camera className="w-5 h-5 text-gray mx-auto mb-1" />
                    <p className="text-xs text-gray">Upload</p>
                  </button>
                </Link>
                <Link href="/pages/realtimeStreamPage">
                  <button className="w-full p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-center">
                    <Eye className="w-5 h-5 text-gray mx-auto mb-1" />
                    <p className="text-xs text-gray">Stream</p>
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
