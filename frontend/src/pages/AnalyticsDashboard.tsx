import React, { useState, useEffect } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  User,
  Users,
  Shield,
  CalendarDays
} from "lucide-react"
import api from "../services/api"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
interface AnalyticsDashboardProps {
  type: "dispatcher" | "fleet" | "admin"
}
// Dispatcher Types
interface PendingRequest {
  id: string
  requester_name: string
  priority: string
  emergency_type: string
  pickup_location: string
  created_at: string
}
interface ActiveMission {
  id: string
  status: string
  created_at: string
  ambulance?: {
    ambulance_number: string
  }
  driver?: {
    name: string
  }
  emergency_request?: {
    requester_name: string
    emergency_type: string
  }
}
interface AvailableAmbulance {
  id: string
  ambulance_number: string
  type: string
  station?: {
    station_name: string
  }
  hospital?: {
    hospital_name: string
  }
  current_latitude?: string
  current_longitude?: string
}
interface DispatcherDashboardData {
  pending_requests_count: number
  active_missions_count: number
  available_ambulances_count: number
  pending_requests: PendingRequest[]
  active_missions: ActiveMission[]
  available_ambulances: AvailableAmbulance[]
}
// Fleet Types
interface ActiveDriver {
  id: string
  name: string
  on_duty: boolean
  availability: boolean
  assigned_ambulance: string | null
}
interface MaintenanceVehicle {
  id: string
  ambulance_number: string
  lifecycle_status: string
  status: string
  entered_at: string
  remarks: string
}
interface FleetDashboardData {
  fleet_summary: {
    availability_rate: number
    total_ambulances: number
    by_status: {
      ACTIVE: number
      MAINTENANCE: number
      INACTIVE: number
    }
    by_lifecycle: Record<string, number>
  }
  driver_availability: {
    on_duty_count: number
    total_drivers: number
    active_drivers_list: ActiveDriver[]
  }
  maintenance_list: MaintenanceVehicle[]
}
// Admin Types
interface AdminDashboardData {
  response_time_metrics: {
    average_response_time_minutes: number
    by_priority: Record<string, number>
    daily_trends: Array<{
      date: string
      avg_response_time_minutes: number
    }>
  }
  mission_statistics: {
    success_rate: number
    total_missions: number
    completed_missions: number
    cancelled_missions: number
    average_trip_duration_minutes: number
    average_trip_distance_km: number
  }
  fleet_utilization: {
    active_utilization_rate: number
    total_trip_hours: number
  }
  operational_performance: {
    average_phase_durations_minutes: Record<string, number>
    daily_mission_volume: Array<{
      date: string
      missions_count: number
    }>
  }
}
const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ type }) => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    setError(null)
    try {
      const response = await api.get(`/dashboards/${type}/`)
      setData(response.data)
    } catch (err) {
      console.error(`Error fetching ${type} dashboard:`, err)
      setError(`Failed to load ${type} dashboard metrics.`)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }
  useEffect(() => {
    fetchDashboardData()
    // Auto polling: 10s for dispatcher dashboard, 30s for fleet, 60s for admin
    const pollInterval = type === "dispatcher" ? 10000 : type === "fleet" ? 30000 : 60000
    const interval = setInterval(() => {
      fetchDashboardData(true)
    }, pollInterval)
    return () => clearInterval(interval)
  }, [type])
  if (loading) {
    return (
      <div className="py-32 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2.5">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
        <span className="font-semibold text-slate-500">Loading operational analytics...</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="py-20 text-center max-w-md mx-auto text-xs text-red-500 flex flex-col items-center justify-center gap-3 border border-dashed border-red-100 rounded-2xl bg-red-50/10 p-6">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <span className="font-semibold">{error}</span>
        <Button
          onClick={() => fetchDashboardData()}
          className="bg-slate-950 hover:bg-slate-800 text-white font-bold h-9 px-4 rounded-lg shadow-sm"
        >
          Try Again
        </Button>
      </div>
    )
  }
  if (!data) return null
  // Render individual dashboards
  if (type === "dispatcher") {
    const dispatchData = data as DispatcherDashboardData
    return (
      <div className="flex flex-col gap-6 w-full animate-fadeIn p-1">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-red-500">
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Emergency Requests</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{dispatchData.pending_requests_count}</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-blue-500">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <Activity className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Missions Deployed</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{dispatchData.active_missions_count}</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-emerald-500">
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <Truck className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ambulances Available (Standby)</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{dispatchData.available_ambulances_count}</h3>
            </div>
          </div>
        </div>
        {/* Dispatcher Workspace Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Column 1: Pending requests */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[520px]">
            <header className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Pending Queue ({dispatchData.pending_requests_count})</h4>
              <Badge className="bg-red-50 text-red-700 border-red-200 animate-pulse flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-ping" /> LIVE
              </Badge>
            </header>
            <div className="flex-1 overflow-y-auto scrollable space-y-3 pr-1">
              {dispatchData.pending_requests.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2.5">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  <span>No pending emergency requests. Queue is clear!</span>
                </div>
              ) : (
                dispatchData.pending_requests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 shadow-sm transition-all text-xs flex flex-col gap-2 relative overflow-hidden"
                    style={{
                      borderLeftWidth: "4px",
                      borderLeftColor:
                        req.priority === "CRITICAL"
                          ? "#ef4444"
                          : req.priority === "HIGH"
                          ? "#f97316"
                          : req.priority === "MEDIUM"
                          ? "#3b82f6"
                          : "#10b981"
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-slate-900">{req.requester_name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        req.priority === "CRITICAL" ? "bg-red-50 text-red-700 border-red-200" :
                        req.priority === "HIGH" ? "bg-orange-50 text-orange-700 border-orange-200" :
                        req.priority === "MEDIUM" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>{req.priority}</span>
                    </div>
                    <div className="space-y-1 text-slate-500">
                      <p className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" /> <span>{req.emergency_type}</span></p>
                      <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" /> <span className="truncate">{req.pickup_location}</span></p>
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium text-right mt-1">Logged {new Date(req.created_at).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          </section>
          {/* Column 2: Active missions */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[520px]">
            <header className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Active Missions ({dispatchData.active_missions_count})</h4>
            </header>
            <div className="flex-1 overflow-y-auto scrollable space-y-3 pr-1">
              {dispatchData.active_missions.length === 0 ? (
                <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Activity className="h-8 w-8 text-slate-300" />
                  <span>No active dispatch missions currently en route.</span>
                </div>
              ) : (
                dispatchData.active_missions.map((m) => (
                  <div key={m.id} className="p-3.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 shadow-sm transition-all text-xs flex flex-col gap-2 relative">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">🚑 {m.ambulance?.ambulance_number || "N/A"}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 uppercase">
                        {m.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-500">
                      <p><span className="font-semibold text-slate-700">Driver:</span> {m.driver?.name || "N/A"}</p>
                      <p className="truncate"><span className="font-semibold text-slate-700">Patient:</span> {m.emergency_request?.requester_name || "N/A"} ({m.emergency_request?.emergency_type})</p>
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium text-right mt-1">Started {new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          </section>
          {/* Column 3: Available Ambulances */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[520px]">
            <header className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Available Fleet ({dispatchData.available_ambulances_count})</h4>
            </header>
            <div className="flex-1 overflow-y-auto scrollable space-y-3 pr-1">
              {dispatchData.available_ambulances.length === 0 ? (
                <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <AlertTriangle className="h-8 w-8 text-amber-400" />
                  <span>No standby ambulances. All active vehicles are dispatched!</span>
                </div>
              ) : (
                dispatchData.available_ambulances.map((amb) => (
                  <div key={amb.id} className="p-3.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 shadow-sm transition-all text-xs flex flex-col gap-1.5 relative">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900">🚑 {amb.ambulance_number}</span>
                      <span className="text-[8px] font-bold bg-slate-50 text-slate-600 border border-slate-200 px-1 py-0.5 rounded">
                        {amb.type}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-500">
                      <p className="truncate"><span className="font-semibold text-slate-700">Base:</span> {amb.station?.station_name || amb.hospital?.hospital_name}</p>
                      {amb.current_latitude && amb.current_longitude && (
                        <p className="font-mono text-[10px] text-slate-400">📍 {parseFloat(amb.current_latitude).toFixed(4)}, {parseFloat(amb.current_longitude).toFixed(4)}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    )
  }
  if (type === "fleet") {
    const fleetData = data as FleetDashboardData
    const summary = fleetData.fleet_summary
    return (
      <div className="flex flex-col gap-6 w-full animate-fadeIn p-1">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-blue-500">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <TrendingUp className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fleet Availability Rate</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{summary.availability_rate}%</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <Truck className="h-6 w-6 text-slate-700" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Fleet Size</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{summary.total_ambulances}</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-emerald-500">
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <Users className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Drivers On Duty</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{fleetData.driver_availability.on_duty_count} / {fleetData.driver_availability.total_drivers}</h3>
            </div>
          </div>
        </div>
        {/* Fleet Breakdown & Maintenance Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 1: Fleet Status & Lifecycle Breakdown */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-6">
            <header className="border-b border-slate-100 pb-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ambulance Status Distribution</h4>
            </header>
            
            <div className="space-y-4">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Administrative Status</h5>
              
              <div className="space-y-3.5">
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-600 font-semibold">Active</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(summary.by_status.ACTIVE / Math.max(1, summary.total_ambulances)) * 100}%` }}></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-900">{summary.by_status.ACTIVE}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-600 font-semibold">Maintenance</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${(summary.by_status.MAINTENANCE / Math.max(1, summary.total_ambulances)) * 100}%` }}></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-900">{summary.by_status.MAINTENANCE}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-600 font-semibold">Inactive</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-400 transition-all duration-500" style={{ width: `${(summary.by_status.INACTIVE / Math.max(1, summary.total_ambulances)) * 100}%` }}></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-900">{summary.by_status.INACTIVE}</span>
                </div>
              </div>
            </div>
            <div className="pt-2 space-y-3">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Operational Lifecycle</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.entries(summary.by_lifecycle).map(([statusKey, count]) => (
                  <div key={statusKey} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                    <span className="text-base font-bold text-slate-900 block">{count}</span>
                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block mt-0.5">{statusKey.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          {/* Section 2: Maintenance list */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[380px]">
            <header className="border-b border-slate-100 pb-3 mb-3 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Ambulances Under Maintenance / Sanitization ({fleetData.maintenance_list.length})</h4>
            </header>
            <div className="flex-1 overflow-y-auto scrollable pr-1">
              {fleetData.maintenance_list.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                  <span>No vehicles currently under maintenance or in sanitization.</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2 pb-3">Ambulance</th>
                      <th className="py-2 pb-3">Reason / Phase</th>
                      <th className="py-2 pb-3">Entered At</th>
                      <th className="py-2 pb-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {fleetData.maintenance_list.map((amb) => (
                      <tr key={amb.id}>
                        <td className="py-3 font-bold text-slate-900">{amb.ambulance_number}</td>
                        <td className="py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            amb.lifecycle_status === "SANITIZATION"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-orange-50 text-orange-700 border-orange-200"
                          }`}>
                            {amb.lifecycle_status === "SANITIZATION" ? "SANITIZATION" : amb.status}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">{new Date(amb.entered_at).toLocaleTimeString()}</td>
                        <td className="py-3 text-slate-400 max-w-[120px] truncate" title={amb.remarks}>{amb.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
        {/* Section 3: Driver Shift & Assignment Roster */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <header className="border-b border-slate-100 pb-3 mb-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Driver Schedule & Standby Roster</h4>
          </header>
          
          {fleetData.driver_availability.active_drivers_list.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <Users className="h-8 w-8 text-slate-300" />
              <span>No registered drivers found.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {fleetData.driver_availability.active_drivers_list.map((d) => (
                <div key={d.id} className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all flex flex-col gap-3.5 bg-slate-50/20 shadow-sm relative">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 truncate">👤 {d.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${d.on_duty ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}
                        title={d.on_duty ? "On Duty (Active Shift)" : "Off Duty"}
                      />
                      <span
                        className={`h-2 w-2 rounded-full ${d.availability ? "bg-emerald-500" : "bg-red-500"}`}
                        title={d.availability ? "Available for Dispatch" : "Occupied on Mission"}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-500">
                    <div className="flex justify-between border-b border-slate-50/50 pb-1">
                      <span>Duty Status:</span>
                      <span className={`font-bold ${d.on_duty ? "text-emerald-700" : "text-slate-500"}`}>
                        {d.on_duty ? "ON DUTY" : "OFF DUTY"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-50/50 pb-1">
                      <span>Dispatch:</span>
                      <span className={`font-bold ${d.availability ? "text-emerald-700" : "text-red-600"}`}>
                        {d.availability ? "AVAILABLE" : "OCCUPIED"}
                      </span>
                    </div>
                    <div className="flex justify-between pb-0.5">
                      <span>Assigned Vehicle:</span>
                      <span className="font-bold text-slate-800">{d.assigned_ambulance ? `🚑 ${d.assigned_ambulance}` : "None"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }
  if (type === "admin") {
    const adminData = data as AdminDashboardData
    const responseMetrics = adminData.response_time_metrics
    const missionStats = adminData.mission_statistics
    const util = adminData.fleet_utilization
    const ops = adminData.operational_performance
    return (
      <div className="flex flex-col gap-6 w-full animate-fadeIn p-1">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-purple-500">
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg Response Time</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{responseMetrics.average_response_time_minutes} mins</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-emerald-500">
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Mission Success Rate</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{missionStats.success_rate}%</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-blue-500">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Utilization Rate</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{util.active_utilization_rate}%</h3>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
              <CalendarDays className="h-6 w-6 text-slate-700" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cumulative Trip Hours</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{util.total_trip_hours} hrs</h3>
            </div>
          </div>
        </div>
        {/* Analysis Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Section 1: Response Times by Severity & Daily Trends */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[390px]">
            <header className="border-b border-slate-100 pb-3 mb-4 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Response Time Analysis</h4>
            </header>
            
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 overflow-hidden">
              <div className="space-y-4 overflow-y-auto scrollable pr-1">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">By Severity Level</h5>
                
                <div className="space-y-3.5">
                  {Object.entries(responseMetrics.by_priority).map(([priority, val]) => (
                    <div key={priority} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-600">{priority}</span>
                        <span className="text-slate-900 font-bold">{val} mins</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            priority === "CRITICAL" ? "bg-red-500" :
                            priority === "HIGH" ? "bg-orange-500" :
                            priority === "MEDIUM" ? "bg-blue-500" :
                            "bg-emerald-500"
                          }`}
                          style={{ width: `${Math.min(100, (val / 30.0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <span className="text-[9px] text-slate-400 text-center block mt-2 font-medium italic">*Bars relative to 30 min target</span>
              </div>
              <div className="flex flex-col min-h-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mb-3">Daily Response Trends</h5>
                <div className="flex-1 overflow-y-auto scrollable pr-1">
                  {responseMetrics.daily_trends.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center">
                      <span>No historical daily trends found.</span>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-2">Date</th>
                          <th className="py-2">Avg Response Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-slate-700">
                        {responseMetrics.daily_trends.map((t) => (
                          <tr key={t.date}>
                            <td className="py-2">{t.date}</td>
                            <td className="py-2 font-bold text-slate-900">{t.avg_response_time_minutes} mins</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </section>
          {/* Section 2: Operational Phase Bottleneck durations */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[390px]">
            <header className="border-b border-slate-100 pb-3 mb-4 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Operational Bottleneck Finder (Avg Phase Duration)</h4>
            </header>
            
            <div className="flex-1 overflow-y-auto scrollable space-y-3.5 pr-1">
              {Object.entries(ops.average_phase_durations_minutes).map(([phase, val]) => (
                <div key={phase} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-600 uppercase tracking-wide text-[10px] font-semibold">{phase.replace("_", " ")}</span>
                    <span className="text-slate-900 font-bold">{val} mins</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-800 transition-all" style={{ width: `${Math.min(100, (val / 45.0) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl mt-3 shrink-0 text-[11px] leading-relaxed text-slate-500">
              💡 <strong>Operational Turnaround:</strong> Phases like Sanitization and Hospital Arrival with higher durations indicate longer vehicle turnover. Address these to increase frequency.
            </div>
          </section>
        </div>
        {/* Section 3: General Mission Statistics & Daily Volume */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Mission Stats Breakdown */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <header className="border-b border-slate-100 pb-3 mb-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Mission Volume & Performance Statistics</h4>
            </header>
            
            <div className="divide-y divide-slate-100 text-xs text-slate-700">
              <div className="flex justify-between py-3">
                <span className="font-semibold text-slate-500">Total Missions Dispatched:</span>
                <span className="font-bold text-slate-900">{missionStats.total_missions} cases</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-semibold text-slate-500">Missions Successfully Completed:</span>
                <span className="font-bold text-emerald-600">{missionStats.completed_missions} cases</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-semibold text-slate-500">Missions Cancelled / Aborted:</span>
                <span className="font-bold text-red-600">{missionStats.cancelled_missions} cases</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-semibold text-slate-500">Average Trip Duration:</span>
                <span className="font-bold text-slate-900">{missionStats.average_trip_duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-semibold text-slate-500">Average Trip Distance:</span>
                <span className="font-bold text-slate-900">{missionStats.average_trip_distance_km} km</span>
              </div>
            </div>
          </section>
          {/* Daily Volumes table */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col h-[275px]">
            <header className="border-b border-slate-100 pb-3 mb-3 shrink-0">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Daily Mission Volume Trends</h4>
            </header>
            <div className="flex-1 overflow-y-auto scrollable pr-1">
              {ops.daily_mission_volume.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center">
                  <span>No volume trends logged yet.</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2">Date</th>
                      <th className="py-2">Missions Dispatched</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-700">
                    {ops.daily_mission_volume.map((v) => (
                      <tr key={v.date}>
                        <td className="py-2.5">{v.date}</td>
                        <td className="py-2.5 font-bold text-slate-900">{v.missions_count} cases</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    )
  }
  return null
}
export default AnalyticsDashboard