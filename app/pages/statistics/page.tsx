"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
} from "@tanstack/react-table"
import { 
  ArrowUpDown, 
  Download, 
  AlertTriangle, 
  TrendingUp, 
  Video, 
  Clock,
  Activity,
  Shield,
  BarChart3,
  FileText
} from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"

interface KeyMoment {
  videoName: string
  timestamp: string
  description: string
  isDangerous: boolean
}

export default function StatisticsPage() {
  const [keyMoments, setKeyMoments] = useState<KeyMoment[]>([])
  const [summary, setSummary] = useState<string>('')
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [chartData, setChartData] = useState<any>({
    videoData: [],
    timelineData: [],
    dangerDistribution: [],
  })
  const [metrics, setMetrics] = useState({
    totalIncidents: 0,
    dangerousCount: 0,
    activeVideos: 0,
    avgResponseTime: '2.3s',
  })

  const exportToCSV = () => {
    const csvContent = [
      ['Video Name', 'Timestamp', 'Description', 'Is Dangerous'].join(','),
      ...keyMoments.map(moment => [
        moment.videoName,
        moment.timestamp,
        `"${moment.description}"`,
        moment.isDangerous
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.setAttribute('href', URL.createObjectURL(blob))
    link.setAttribute('download', `statistics-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  useEffect(() => {
    const demoVideos = [
      {
        name: "Front Entrance Monitor",
        timestamps: [
          { timestamp: "00:15", description: "Person loitering near entrance", isDangerous: true },
          { timestamp: "02:30", description: "Unauthorized access attempt", isDangerous: true },
          { timestamp: "05:45", description: "Normal foot traffic", isDangerous: false },
          { timestamp: "08:20", description: "Suspicious package left", isDangerous: true },
        ]
      },
      {
        name: "Parking Lot Camera A",
        timestamps: [
          { timestamp: "01:10", description: "Vehicle break-in detected", isDangerous: true },
          { timestamp: "03:25", description: "Regular parking activity", isDangerous: false },
          { timestamp: "06:40", description: "Altercation between individuals", isDangerous: true },
        ]
      },
      {
        name: "Store Interior - Aisle 3",
        timestamps: [
          { timestamp: "00:45", description: "Shoplifting incident", isDangerous: true },
          { timestamp: "02:55", description: "Customer browsing", isDangerous: false },
          { timestamp: "05:30", description: "Potential theft detected", isDangerous: true },
        ]
      },
    ]

    const savedVideos = JSON.parse(localStorage.getItem("savedVideos") || "[]")
    const videosToUse = savedVideos.length > 0 ? savedVideos : demoVideos
    
    const moments: KeyMoment[] = videosToUse.flatMap((video: any) =>
      video.timestamps.map((ts: any) => ({
        videoName: video.name,
        timestamp: ts.timestamp,
        description: ts.description,
        isDangerous: ts.isDangerous || false,
      }))
    )
    setKeyMoments(moments)

    const fetchSummary = async () => {
      setIsLoadingSummary(true)
      try {
        const response = await fetch('/api/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyMoments: moments })
        })
        const data = await response.json()
        if (data.error) throw new Error(data.error)
        setSummary(data.summary)
      } catch (error: any) {
        setSummary(`Error: ${error?.message || 'Unable to generate summary'}`)
      } finally {
        setIsLoadingSummary(false)
      }
    }

    if (moments.length > 0) fetchSummary()

    const dangerousMoments = moments.filter((m) => m.isDangerous)

    const dangerousByVideo = dangerousMoments.reduce((acc: Record<string, number>, moment) => {
      acc[moment.videoName] = (acc[moment.videoName] || 0) + 1
      return acc
    }, {})

    const videoChartData = Object.entries(dangerousByVideo).map(([name, count]) => ({
      name: name.length > 15 ? name.slice(0, 15) + '...' : name,
      incidents: count,
    }))

    const trendData = moments.reduce((acc: Record<string, number>, m) => {
      const [mm, ss] = (m.timestamp || '00:00').split(':').map(Number)
      const interval = `${String(mm).padStart(2, '0')}:${String(Math.floor(ss / 15) * 15).padStart(2, '0')}`
      acc[interval] = (acc[interval] || 0) + 1
      return acc
    }, {})

    const timelineChartData = Object.entries(trendData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => ({ time, incidents: count }))

    const dangerousCount = dangerousMoments.length
    const nonDangerousCount = moments.length - dangerousCount

    setChartData({
      videoData: videoChartData,
      timelineData: timelineChartData,
      dangerDistribution: [
        { name: 'Dangerous', value: dangerousCount, color: '#FF4D4D' },
        { name: 'Safe', value: nonDangerousCount, color: '#4DFFBC' },
      ],
    })

    setMetrics({
      totalIncidents: moments.length,
      dangerousCount,
      activeVideos: videosToUse.length,
      avgResponseTime: '2.3s',
    })
  }, [])

  const columnHelper = createColumnHelper<KeyMoment>()

  const columns = [
    columnHelper.accessor("videoName", {
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="flex items-center gap-2 text-gray hover:text-white transition-colors"
        >
          Video <ArrowUpDown className="w-3 h-3" />
        </button>
      ),
      cell: (info) => <span className="text-white">{info.getValue()}</span>,
    }),
    columnHelper.accessor("timestamp", {
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="flex items-center gap-2 text-gray hover:text-white transition-colors"
        >
          Time <ArrowUpDown className="w-3 h-3" />
        </button>
      ),
      cell: (info) => <span className="text-gray">{info.getValue()}</span>,
    }),
    columnHelper.accessor("description", {
      header: "Description",
      cell: (info) => <span className="text-white">{info.getValue()}</span>,
    }),
    columnHelper.accessor("isDangerous", {
      header: "Status",
      cell: (info) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          info.getValue() ? "bg-coral/10 text-coral" : "bg-mint/10 text-mint"
        }`}>
          {info.getValue() ? "Alert" : "Safe"}
        </span>
      ),
    }),
  ]

  const table = useReactTable({
    data: keyMoments,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Analytics</h1>
            <p className="text-gray text-sm">Incident analysis and reporting</p>
          </div>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#111] rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide">Incidents</span>
              <Activity className="w-4 h-4 text-gray" />
            </div>
            <div className="text-2xl font-bold text-white">{metrics.totalIncidents}</div>
            <div className="text-mint text-xs mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12%
            </div>
          </div>

          <div className="bg-[#111] rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide">Alerts</span>
              <AlertTriangle className="w-4 h-4 text-coral" />
            </div>
            <div className="text-2xl font-bold text-white">{metrics.dangerousCount}</div>
            <div className="text-coral text-xs mt-1">
              {metrics.totalIncidents > 0 
                ? `${((metrics.dangerousCount / metrics.totalIncidents) * 100).toFixed(0)}% of total`
                : '0%'}
            </div>
          </div>

          <div className="bg-[#111] rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide">Videos</span>
              <Video className="w-4 h-4 text-gray" />
            </div>
            <div className="text-2xl font-bold text-white">{metrics.activeVideos}</div>
            <div className="text-gray text-xs mt-1">Active sources</div>
          </div>

          <div className="bg-[#111] rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray text-xs uppercase tracking-wide">Response</span>
              <Clock className="w-4 h-4 text-mint" />
            </div>
            <div className="text-2xl font-bold text-white">{metrics.avgResponseTime}</div>
            <div className="text-mint text-xs mt-1">-0.2s faster</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Bar Chart */}
          <div className="lg:col-span-2 bg-[#111] rounded-xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-medium">Incidents by Source</span>
              <BarChart3 className="w-4 h-4 text-gray" />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData.videoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="name" stroke="#898989" fontSize={11} />
                <YAxis stroke="#898989" fontSize={11} />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: '#111', 
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
                <Bar dataKey="incidents" fill="#4DFFBC" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="bg-[#111] rounded-xl border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-white font-medium">Distribution</span>
              <Shield className="w-4 h-4 text-gray" />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={chartData.dangerDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={70}
                  dataKey="value"
                >
                  {chartData.dangerDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: '#111', 
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-[#111] rounded-xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-medium">Timeline</span>
            <TrendingUp className="w-4 h-4 text-gray" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData.timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="time" stroke="#898989" fontSize={11} />
              <YAxis stroke="#898989" fontSize={11} />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: '#111', 
                  border: '1px solid #333',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Area type="monotone" dataKey="incidents" stroke="#FF4D4D" fill="#FF4D4D" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* AI Summary */}
        <div className="bg-mint/5 border border-mint/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-mint" />
            <span className="text-white font-medium">AI Summary</span>
          </div>
          {isLoadingSummary ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-4 h-4 border-2 border-mint border-t-transparent rounded-full animate-spin" />
              <span className="text-gray text-sm">Analyzing...</span>
            </div>
          ) : summary ? (
            <p className="text-gray text-sm leading-relaxed whitespace-pre-line">{summary}</p>
          ) : (
            <p className="text-gray/50 text-sm">No data available</p>
          )}
        </div>

        {/* Table */}
        <div className="bg-[#111] rounded-xl border border-white/5 overflow-hidden">
          <div className="p-5 border-b border-white/5">
            <span className="text-white font-medium">Event Log</span>
            <span className="text-gray text-sm ml-2">({keyMoments.length} events)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-white/5">
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-5 py-3 text-left text-xs font-medium">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-5 py-3 text-sm">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="h-24 text-center text-gray">
                      No events
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
