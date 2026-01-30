"use client"

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from "../../lib/utils"

interface TimelineProps {
  events: {
    startTime: number
    endTime: number
    type: 'normal' | 'warning'
    label: string
  }[]
  totalDuration: number
  currentTime?: number
}

export function Timeline({ events, totalDuration, currentTime = 0 }: TimelineProps) {
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: TimelineProps['events'][0]
    position: { x: number; y: number }
  } | null>(null)

  return (
    <>
      <div className="w-full overflow-hidden">
        <div className="relative w-full h-20 bg-white/[0.02] rounded-lg overflow-x-auto">
          <div className="absolute w-full min-w-full">
            {/* Timeline base */}
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 transform -translate-y-1/2">
              {/* Time markers */}
              {Array.from({ length: 11 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute h-2 w-px bg-white/20"
                  style={{
                    left: `${(i / 10) * 100}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                >
                  <span className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 text-xs text-gray whitespace-nowrap">
                    {Math.floor((i / 10) * totalDuration)}s
                  </span>
                </div>
              ))}
            </div>

            {/* Events */}
            {events.map((event, index) => {
              const startPercentage = (event.startTime / totalDuration) * 100
              const duration = ((event.endTime - event.startTime) / totalDuration) * 100
              
              return (
                <div
                  key={index}
                  className={cn(
                    "absolute h-2 rounded-full cursor-pointer transition-colors",
                    event.type === 'warning' ? 'bg-coral hover:bg-coral-light' : 'bg-mint hover:bg-mint-light'
                  )}
                  style={{
                    left: `${startPercentage}%`,
                    width: `${Math.max(duration, 1)}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredEvent({
                      event,
                      position: { x: rect.left + (rect.width / 2), y: rect.top - 10 }
                    })
                  }}
                  onMouseLeave={() => setHoveredEvent(null)}
                />
              )
            })}

            {/* Current time indicator */}
            {currentTime > 0 && (
              <div
                className="absolute w-0.5 h-6 bg-white rounded-full"
                style={{
                  left: `${(currentTime / totalDuration) * 100}%`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
            )}
          </div>
        </div>
      </div>
      {hoveredEvent && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed px-3 py-2 bg-[#111] text-white text-sm pointer-events-none z-50 max-w-[200px] rounded-lg border border-white/10 shadow-xl"
          style={{
            left: `${hoveredEvent.position.x}px`,
            top: `${hoveredEvent.position.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="text-xs mb-1 line-clamp-2">{hoveredEvent.event.label}</div>
          <div className="text-gray text-xs flex items-center gap-2">
            <span>
              {Math.floor(hoveredEvent.event.startTime / 60)}:{String(Math.floor(hoveredEvent.event.startTime % 60)).padStart(2, '0')}
            </span>
            <span className={cn(
              "px-1.5 py-0.5 rounded text-xs",
              hoveredEvent.event.type === 'warning' ? 'bg-coral/20 text-coral' : 'bg-mint/20 text-mint'
            )}>
              {hoveredEvent.event.type === 'warning' ? 'Alert' : 'Safe'}
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
