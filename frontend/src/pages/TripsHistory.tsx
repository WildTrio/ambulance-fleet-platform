import React, { useState, useEffect, useRef } from "react"
import {
  MapPin,
  User,
  Truck,
  Calendar,
  Clock,
  Printer,
  X,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  ChevronRight,
  TrendingUp
} from "lucide-react"
import api from "../services/api"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"

interface Driver {
  id: string
  name: string
  license_number: string
}

interface Ambulance {
  id: string
  ambulance_number: string
  type: string
}

interface Trip {
  id: number
  status: string
  ambulance_number?: string
  driver_name?: string
  start_time?: string
  end_time?: string
  distance_km: string | number
  summary?: string
  emergency_type?: string
  patient_name?: string
  hospital_name?: string
  station_name?: string
}

interface RouteLog {
  latitude: string
  longitude: string
}

const TripsHistory: React.FC = () => {
  // Lists
  const [trips, setTrips] = useState<Trip[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [ambulances, setAmbulances] = useState<Ambulance[]>([])

  // Filters state
  const [selectedDriver, setSelectedDriver] = useState("")
  const [selectedAmbulance, setSelectedAmbulance] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Loading/Error states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected Trip for detailed report modal
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)

  const fetchFiltersData = async () => {
    try {
      const [driversRes, ambsRes] = await Promise.all([
        api.get("/drivers/"),
        api.get("/ambulances/")
      ])
      setDrivers(driversRes.data)
      setAmbulances(ambsRes.data)
    } catch (err) {
      console.error("Error fetching filters data:", err)
    }
  }

  const fetchTrips = async () => {
    setLoading(true)
    setError(null)
    try {
      const queryParams: string[] = []
      if (selectedDriver) queryParams.push(`driver_id=${selectedDriver}`)
      if (selectedAmbulance) queryParams.push(`ambulance_id=${selectedAmbulance}`)
      if (selectedStatus) queryParams.push(`status=${selectedStatus}`)
      if (startDate) queryParams.push(`start_date=${startDate}`)
      if (endDate) queryParams.push(`end_date=${endDate}`)

      const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : ""
      const response = await api.get(`/trips/${queryString}`)
      setTrips(response.data)
    } catch (err) {
      console.error("Error fetching trips:", err)
      setError("Failed to load trips history.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiltersData()
  }, [])

  useEffect(() => {
    fetchTrips()
  }, [selectedDriver, selectedAmbulance, selectedStatus, startDate, endDate])

  const handleClearFilters = () => {
    setSelectedDriver("")
    setSelectedAmbulance("")
    setSelectedStatus("")
    setStartDate("")
    setEndDate("")
  }

  const completedCount = trips.filter((t) => (t.status || "").toUpperCase() === "COMPLETED").length
  const cancelledCount = trips.filter((t) => (t.status || "").toUpperCase() === "CANCELLED").length

  const getStatusBadge = (status: string) => {
    const s = (status || "").toUpperCase()
    switch (s) {
      case "COMPLETED":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Completed</Badge>
      case "CANCELLED":
        return <Badge className="bg-red-50 text-red-700 border-red-200">Cancelled</Badge>
      default:
        return <Badge className="bg-slate-50 text-slate-700 border-slate-200">{status}</Badge>
    }
  }

  const calculateDuration = (start?: string, end?: string) => {
    if (!start || !end) return "0 mins"
    const diffMs = new Date(end).getTime() - new Date(start).getTime()
    const diffMins = Math.max(0, Math.round(diffMs / 60000))
    return `${diffMins} mins`
  }

  // Leaflet map setup for modal
  const historyMapRef = useRef<any>(null)
  const historyMarkersRef = useRef<any>(null)
  const historyPolylineRef = useRef<any>(null)

  useEffect(() => {
    if (!selectedTrip || !(window as any).L) return

    const timer = setTimeout(async () => {
      const mapContainer = document.getElementById("history-map")
      if (!mapContainer) return

      if (!historyMapRef.current) {
        const map = (window as any).L.map("history-map").setView([21.8206, 75.6094], 12)
          ; (window as any).L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors"
          }).addTo(map)
        historyMarkersRef.current = (window as any).L.layerGroup().addTo(map)
        historyMapRef.current = map
      }

      const map = historyMapRef.current
      const markers = historyMarkersRef.current
      markers.clearLayers()

      if (historyPolylineRef.current) {
        map.removeLayer(historyPolylineRef.current)
        historyPolylineRef.current = null
      }

      try {
        const response = await api.get(`/trips/${selectedTrip.id}/route-history/`)
        const logs: RouteLog[] = response.data

        if (logs && logs.length > 0) {
          const latLons = logs.map((l) => [parseFloat(l.latitude), parseFloat(l.longitude)])

            // Start marker
            ; (window as any).L.circleMarker(latLons[0], {
              radius: 8,
              fillColor: "#10b981",
              color: "#ffffff",
              weight: 2,
              opacity: 1,
              fillOpacity: 0.9
            }).addTo(markers).bindPopup("Trip Start")

          // End marker
          if (latLons.length > 1) {
            ; (window as any).L.circleMarker(latLons[latLons.length - 1], {
              radius: 8,
              fillColor: "#ef4444",
              color: "#ffffff",
              weight: 2,
              opacity: 1,
              fillOpacity: 0.9
            }).addTo(markers).bindPopup(selectedTrip.status === "COMPLETED" ? "Destination Arrived" : "Trip Aborted")
          }

          // Polyline path
          const polyline = (window as any).L.polyline(latLons, {
            color: "#3b82f6",
            weight: 5,
            opacity: 0.8
          }).addTo(map)
          historyPolylineRef.current = polyline

          map.fitBounds(polyline.getBounds(), { padding: [30, 30] })
        }
      } catch (err) {
        console.error("Error loading route history:", err)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      if (historyMapRef.current) {
        historyMapRef.current.remove()
        historyMapRef.current = null
        historyMarkersRef.current = null
        historyPolylineRef.current = null
      }
    }
  }, [selectedTrip])

  const handlePrintReport = () => {
    window.print()
  }

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn p-1">

      {/* Header section with Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <Activity className="h-6 w-6 text-slate-700" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Missions Logged</span>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{trips.length}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4">
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed Trips</span>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{completedCount}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4">
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cancelled Missions</span>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{cancelledCount}</h3>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
        {/* Left Side: Filter Panel */}
        <aside className="w-full lg:w-80 bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] shrink-0 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" /> Filters
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-xs text-slate-500 hover:text-slate-900 h-8 px-2.5 rounded-lg border-none"
            >
              Clear All
            </Button>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Driver Assignment</label>
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-900 bg-white text-slate-900 font-medium"
            >
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.license_number})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vehicle Number</label>
            <select
              value={selectedAmbulance}
              onChange={(e) => setSelectedAmbulance(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-900 bg-white text-slate-900 font-medium"
            >
              <option value="">All Vehicles</option>
              {ambulances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ambulance_number} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mission Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-900 bg-white text-slate-900 font-medium"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full" />
          </div>
        </aside>

        {/* Right Side: Trips Table / List */}
        <section className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-slate-500" /> Trip Records Archive
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTrips}
              className="text-xs font-bold border-slate-200 h-9 gap-1.5 rounded-lg"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Logs
            </Button>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                <span>Loading trip archives...</span>
              </div>
            ) : error ? (
              <div className="py-16 text-center text-xs text-red-500 flex flex-col items-center justify-center gap-2 border border-dashed border-red-100 rounded-xl">
                <AlertTriangle className="h-6 w-6 text-red-400" />
                <span>{error}</span>
              </div>
            ) : trips.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3 border border-dashed border-slate-200 rounded-xl">
                <MapPin className="h-8 w-8 text-slate-300" />
                <span>No matching trip logs found. Try adjusting filters.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    <th className="py-3 px-4">Trip ID</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Ambulance</th>
                    <th className="py-3 px-4">Driver</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Distance</th>
                    <th className="py-3 px-4 hidden md:table-cell">Report Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trips.map((trip) => (
                    <tr
                      key={trip.id}
                      onClick={() => setSelectedTrip(trip)}
                      className="group cursor-pointer hover:bg-slate-50/60 transition-colors text-xs text-slate-700"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900 group-hover:text-slate-950">
                        #{trip.id}
                      </td>
                      <td className="py-3.5 px-4">
                        {getStatusBadge(trip.status)}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        🚑 {trip.ambulance_number || "N/A"}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        👤 {trip.driver_name || "N/A"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {trip.start_time ? new Date(trip.start_time).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {calculateDuration(trip.start_time, trip.end_time)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {trip.distance_km} km
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 truncate max-w-[200px] hidden md:table-cell" title={trip.summary}>
                        {trip.summary || "No summary available."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Modal for detailed Trip Summary Report */}
      {selectedTrip && (
        <div
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedTrip(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden animate-zoomIn flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-slate-500" /> Ambulance Mission Summary Report
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrintReport}
                  className="font-bold border-slate-200 h-8 gap-1.5 rounded-lg text-xs"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Report
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedTrip(null)}
                  className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto scrollable p-6 space-y-6 print-section">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mission Status:</span>
                  {getStatusBadge(selectedTrip.status)}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Generated on {new Date().toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-slate-400" /> Vehicle & Driver Info
                  </h4>
                  <div className="grid grid-cols-3 text-xs gap-y-2">
                    <span className="text-slate-400 font-medium col-span-1">Ambulance No:</span>
                    <span className="text-slate-800 font-semibold col-span-2">{selectedTrip.ambulance_number || "N/A"}</span>

                    <span className="text-slate-400 font-medium col-span-1">Assigned Driver:</span>
                    <span className="text-slate-800 font-semibold col-span-2">{selectedTrip.driver_name || "N/A"}</span>

                    <span className="text-slate-400 font-medium col-span-1">Base Station:</span>
                    <span className="text-slate-800 font-semibold col-span-2">{selectedTrip.station_name || "N/A"}</span>
                  </div>
                </section>

                <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
                    <User className="h-4 w-4 text-slate-400" /> Patient & Emergency Info
                  </h4>
                  <div className="grid grid-cols-3 text-xs gap-y-2">
                    <span className="text-slate-400 font-medium col-span-1">Emergency Type:</span>
                    <span className="text-slate-900 font-bold col-span-2 flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      {selectedTrip.emergency_type || "N/A"}
                    </span>

                    <span className="text-slate-400 font-medium col-span-1">Patient Name:</span>
                    <span className="text-slate-800 font-semibold col-span-2">{selectedTrip.patient_name || "N/A"}</span>

                    <span className="text-slate-400 font-medium col-span-1">Hospital Destination:</span>
                    <span className="text-slate-800 font-semibold col-span-2">{selectedTrip.hospital_name || "N/A"}</span>
                  </div>
                </section>
              </div>

              <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-slate-400" /> Trip Performance Metrics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Distance</span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{selectedTrip.distance_km} km</h3>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Duration</span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{calculateDuration(selectedTrip.start_time, selectedTrip.end_time)}</h3>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Depart Time</span>
                    <span className="text-xs font-semibold text-slate-800 block mt-1">
                      {selectedTrip.start_time ? new Date(selectedTrip.start_time).toLocaleTimeString() : "N/A"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Resolve Time</span>
                    <span className="text-xs font-semibold text-slate-800 block mt-1">
                      {selectedTrip.end_time ? new Date(selectedTrip.end_time).toLocaleTimeString() : "N/A"}
                    </span>
                  </div>
                </div>
              </section>

              {/* Traveled Route History Map */}
              <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 no-print">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" /> Traveled Route History
                </h4>
                <div id="history-map" className="w-full h-[280px] rounded-lg border border-slate-200 z-10 bg-slate-50"></div>
              </section>

              <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-50 pb-2 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-slate-400" /> Natural Language Narrative
                </h4>
                <blockquote className="border-l-4 border-slate-900 pl-4 py-1 italic text-slate-600 text-xs leading-relaxed bg-slate-50/50 rounded-r-lg pr-4">
                  "{selectedTrip.summary || "No narrative description generated for this trip."}"
                </blockquote>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TripsHistory
