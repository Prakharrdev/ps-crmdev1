"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"

type Activity = {
  id: number
  type: "completed" | "assigned" | "message"
  text: string
  time: string
}

const activities: Activity[] = [
  {
    id: 1,
    type: "completed",
    text: "Complaint #CMP-8830 marked as Complete",
    time: "10 min ago",
  },
  {
    id: 2,
    type: "assigned",
    text: "New complaint #CMP-8835 assigned",
    time: "35 min ago",
  },
  {
    id: 3,
    type: "message",
    text: "Authority message received: Ward 12 update",
    time: "1 hour ago",
  },
]

function getIcon(type: string) {
  switch (type) {
    case "completed":
      return "✓"
    case "assigned":
      return "→"
    case "message":
      return "✉"
    default:
      return "•"
  }
}

function getColor(type: string) {
  switch (type) {
    case "completed":
      return "bg-green-500"
    case "assigned":
      return "bg-blue-500"
    case "message":
      return "bg-gray-500"
    default:
      return "bg-gray-400"
  }
}

export default function RecentActivityPanel() {

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {

    if (!panelRef.current) return

    gsap.fromTo(
      panelRef.current.querySelectorAll(".activity-item"),
      {
        opacity: 0,
        y: 10
      },
      {
        opacity: 1,
        y: 0,
        stagger: 0.1,
        duration: 0.4,
        ease: "power2.out"
      }
    )

  }, [])

  return (
    <div
      ref={panelRef}
      className="bg-white border rounded-xl p-5 shadow-sm"
    >

      <h2 className="text-lg font-semibold mb-4">
        Recent Activity
      </h2>

      <div className="space-y-4">

        {activities.map((activity) => (

          <div
            key={activity.id}
            className="activity-item flex items-start gap-3"
          >

            {/* Icon */}
            <div
              className={`w-7 h-7 flex items-center justify-center text-white text-sm rounded-full ${getColor(activity.type)}`}
            >
              {getIcon(activity.type)}
            </div>

            {/* Content */}
            <div className="flex-1">

              <p className="text-sm text-gray-700">
                {activity.text}
              </p>

              <span className="text-xs text-gray-400">
                {activity.time}
              </span>

            </div>

          </div>

        ))}

      </div>

    </div>
  )
}