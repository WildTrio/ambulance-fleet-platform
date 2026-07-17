import React, { useState, useEffect, useRef } from "react"
import {
  Navigation,
  Truck,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  History,
  User,
  AlertCircle,
  RefreshCw,
  Info,
  Map
} from "lucide-react"
import api from "../services/api"
import { notify } from "@/components/ui/Toast"
import { Button } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/Skeleton"
import { Badge } from "@/components/ui/Badge"

interface Hospital {
  id: number
  hospital_name: string
  address: string
  city: string
}

interface Station {
  id: number
  station_name: string
  latitude: string | number
  longitude: string | number
}

interface ActiveMission {
  id: number
  priority: string
  emergency_type: string
  requester_name: string
  pickup_location: string
}

interface Ambulance {
  id: number
  ambulance_number: string
  type: string
  lifecycle_status: string
  current_latitude: string | number | null
  current_longitude: string | number | null
  hospital: Hospital | null
  station: Station | null
  active_mission: ActiveMission | null
}

interface LifecycleLog {
  id: number
  from_status: string
  to_status: string
  remarks: string | null
  changed_at: string
  changed_by_name: string | null
}

interface Trip {
  id: number
  status: string
  start_time: string | null
  end_time: string | null
  distance_km: string | number
  summary: string | null
}

interface RouteDestination {
  name: string
  latitude: number
  longitude: number
}

interface RouteInfo {
  route: [number, number][]
  distance_km: number
  eta_minutes: number
  destination: RouteDestination | null
}

const LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ["ASSIGNED"],
  ASSIGNED: ["EN_ROUTE", "AVAILABLE"],
  EN_ROUTE: ["AT_INCIDENT", "AVAILABLE"],
  AT_INCIDENT: ["PATIENT_ONBOARD", "AVAILABLE"],
  PATIENT_ONBOARD: ["HOSPITAL_ARRIVAL", "SANITIZATION", "AVAILABLE"],
  HOSPITAL_ARRIVAL: ["SANITIZATION", "AVAILABLE"],
  SANITIZATION: ["READY", "AVAILABLE"],
  READY: ["AVAILABLE"],
}

export default function DriverConsole() {
  const [ambulance, setAmbulance] = useState<Ambulance | null>(null)
  const [history, setHistory] = useState<LifecycleLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [remarks, setRemarks] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsExpanded, setTripsExpanded] = useState(false)

  // Map and Telemetry State
  const [simulating, setSimulating] = useState(false)
  const [useDeviceGPS, setUseDeviceGPS] = useState(false)
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)

  const driverMapRef = useRef<any>(null)
  const driverMarkersRef = useRef<any>(null)
  const driverRouteRef = useRef<any>(null)

  const fetchAssignment = async () => {
    try {
      const response = await api.get("/ambulances/my-assignment/")
      setAmbulance(response.data)
      if (response.data?.id) {
        fetchHistory(response.data.id)
      }
      setError(null)
    } catch (err: any) {
      console.error("Error fetching driver assignment:", err)
      if (err.response && err.response.status === 404) {
        setAmbulance(null)
      } else {
        setError("Failed to fetch assignment details.")
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async (ambulanceId: number) => {
    try {
      const response = await api.get(`/ambulances/${ambulanceId}/lifecycle-history/`)
      setHistory(response.data)
    } catch (err) {
      console.error("Error fetching lifecycle history:", err)
    }
  }

  const fetchTrips = async () => {
    setTripsLoading(true)
    try {
      const response = await api.get("/trips/my-trips/")
      setTrips(response.data)
    } catch (err) {
      console.error("Error fetching driver trips:", err)
    } finally {
      setTripsLoading(false)
    }
  }

  useEffect(() => {
    fetchAssignment()
    fetchTrips()
  }, [])

  const handleTransition = async (targetStatus: string) => {
    if (!ambulance) return
    setSubmitting(true)
    setError(null)

    try {
      const defaultRemarks = `Transitioned to ${targetStatus} by driver.`
      await api.post(`/ambulances/${ambulance.id}/transition-lifecycle/`, {
        status: targetStatus,
        remarks: remarks || defaultRemarks,
      })
      notify.success(`Successfully transitioned to ${getStatusLabel(targetStatus)}`)
      setRemarks("")
      
      // Refresh details
      await fetchAssignment()
      fetchTrips()
    } catch (err: any) {
      console.error("Error transitioning status:", err)
      const detail = err.response?.data?.detail || "Failed to transition status."
      setError(detail)
      notify.error(detail)
    } finally {
      setSubmitting(false)
    }
  }

  const activeMission = ambulance?.active_mission
  const currentStatus = ambulance?.lifecycle_status || "AVAILABLE"
  const nextValidStatuses = LIFECYCLE_TRANSITIONS[currentStatus] || []

  // Initialize Map
  useEffect(() => {
    if (!(window as any).L || !ambulance) return
    const mapContainer = document.getElementById("driver-map")
    if (!mapContainer) return

    if (!driverMapRef.current) {
      const defaultLat = ambulance.current_latitude ? parseFloat(ambulance.current_latitude as string) : (ambulance.station ? parseFloat(ambulance.station.latitude as string) : 21.820600)
      const defaultLon = ambulance.current_longitude ? parseFloat(ambulance.current_longitude as string) : (ambulance.station ? parseFloat(ambulance.station.longitude as string) : 75.609400)

      const map = (window as any).L.map("driver-map", {
        zoomControl: false
      }).setView([defaultLat, defaultLon], 14);

      // Add clean Mapbox-style Light tiles from OpenStreetMap
      (window as any).L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '© CartoDB'
      }).addTo(map);

      // Put zoom controls in the bottom-right corner
      (window as any).L.control.zoom({
        position: 'bottomright'
      }).addTo(map);

      driverMarkersRef.current = (window as any).L.layerGroup().addTo(map)
      driverMapRef.current = map
      setCurrentCoords({ latitude: defaultLat, longitude: defaultLon })
    }

    return () => {
      if (driverMapRef.current) {
        driverMapRef.current.remove()
        driverMapRef.current = null
        driverMarkersRef.current = null
        driverRouteRef.current = null
      }
    }
  }, [ambulance])

  // Fetch Route when activeMission changes
  useEffect(() => {
    if (!ambulance || !activeMission || !driverMapRef.current) return

    const fetchRoute = async () => {
      try {
        const response = await api.get(`/missions/${activeMission.id}/route/`)
        const data: RouteInfo = response.data
        setRouteInfo(data)

        if (driverRouteRef.current) {
          driverMapRef.current.removeLayer(driverRouteRef.current)
          driverRouteRef.current = null
        }

        if (data.route && data.route.length > 0) {
          const polyline = (window as any).L.polyline(data.route, {
            color: "#000000", // Elegant dark route line
            weight: 5,
            opacity: 0.95
          }).addTo(driverMapRef.current);
          driverRouteRef.current = polyline;
          driverMapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        }
      } catch (err) {
        console.error("Error fetching route in driver console:", err)
      }
    }

    fetchRoute()
  }, [ambulance, activeMission?.id, ambulance?.lifecycle_status])

  // GPS Simulation Loop
  useEffect(() => {
    if (!simulating || !routeInfo?.route || routeInfo.route.length === 0 || !ambulance) {
      return
    }

    let currentIndex = 0
    const routePoints = routeInfo.route

    const interval = setInterval(async () => {
      if (currentIndex >= routePoints.length) {
        setSimulating(false)
        clearInterval(interval)
        return
      }

      const point = routePoints[currentIndex]
      const nextLat = point[0]
      const nextLon = point[1]

      setCurrentCoords({ latitude: nextLat, longitude: nextLon })

      try {
        await api.post(`/ambulances/${ambulance.id}/update-location/`, {
          latitude: nextLat,
          longitude: nextLon,
        })
      } catch (err) {
        console.error("Error updating simulated location:", err)
      }

      currentIndex++
    }, 4000)

    return () => clearInterval(interval)
  }, [simulating, routeInfo, ambulance])

  // Toggle GPS sync rules
  useEffect(() => {
    if (useDeviceGPS) setSimulating(false)
  }, [useDeviceGPS])

  useEffect(() => {
    if (simulating) setUseDeviceGPS(false)
  }, [simulating])

  // HTML5 Geolocation API
  useEffect(() => {
    if (!useDeviceGPS || !navigator.geolocation || !ambulance) return

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        setCurrentCoords({ latitude, longitude })

        try {
          await api.post(`/ambulances/${ambulance.id}/update-location/`, {
            latitude,
            longitude,
          })
        } catch (err) {
          console.error("Error updating location from device GPS:", err)
        }
      },
      (err) => {
        console.error("Error watching device position:", err)
        notify.error("Unable to retrieve GPS coordinates: " + err.message)
        setUseDeviceGPS(false)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [useDeviceGPS, ambulance])

  // Update Markers
  useEffect(() => {
    if (!driverMapRef.current || !driverMarkersRef.current || !(window as any).L) return
    const markers = driverMarkersRef.current
    markers.clearLayers()

    if (currentCoords) {
      // Custom Ambulance Marker styled per status
      const indicatorColor = 
        currentStatus === "SANITIZATION" ? "bg-slate-400 ring-slate-200" :
        (activeMission?.priority === "CRITICAL" ? "bg-red-500 ring-red-200" : "bg-blue-500 ring-blue-200")

      const pulseAnimation = activeMission?.priority === "CRITICAL" ? "animate-ping" : "animate-pulse"

      const customIcon = (window as any).L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <span class="absolute inline-flex h-full w-full rounded-full ${indicatorColor} opacity-75 ${pulseAnimation}"></span>
            <div class="relative flex items-center justify-center w-7 h-7 rounded-full ${indicatorColor.split(' ')[0]} border-2 border-white shadow-md text-white text-xs">
              🚑
            </div>
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      (window as any).L.marker([currentCoords.latitude, currentCoords.longitude], { icon: customIcon })
        .addTo(markers)
        .bindPopup("Your Location");
    }

    if (routeInfo?.destination) {
      const dest = routeInfo.destination;
      const destIcon = (window as any).L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="flex items-center justify-center w-7 h-7 rounded-full bg-red-600 border-2 border-white shadow-md text-white text-xs font-semibold">
              📍
            </div>
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      (window as any).L.marker([dest.latitude, dest.longitude], { icon: destIcon })
        .addTo(markers)
        .bindPopup(`Destination: ${dest.name}`);
    }
  }, [currentCoords, routeInfo, currentStatus, activeMission?.priority])

  // Center Map on Location
  const handleRecenter = () => {
    if (driverMapRef.current && currentCoords) {
      driverMapRef.current.panTo([currentCoords.latitude, currentCoords.longitude], { animate: true })
    }
  }

  // Visual text helpers
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "AVAILABLE": return "Available"
      case "ASSIGNED": return "Assigned"
      case "EN_ROUTE": return "En Route"
      case "AT_INCIDENT": return "At Incident"
      case "PATIENT_ONBOARD": return "Patient Onboard"
      case "HOSPITAL_ARRIVAL": return "Hospital Arrival"
      case "SANITIZATION": return "Sanitization"
      case "READY": return "Ready"
      default: return status
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "AVAILABLE": return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "READY": return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "ASSIGNED": return "bg-slate-50 text-slate-700 border-slate-200"
      case "EN_ROUTE": return "bg-blue-50 text-blue-700 border-blue-200"
      case "SANITIZATION": return "bg-slate-50 text-slate-500 border-slate-200"
      default: return "bg-red-50 text-red-700 border-red-200"
    }
  }

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case "CRITICAL": return "bg-red-900/10 text-red-700 border-red-200"
      case "HIGH": return "bg-orange-50 text-orange-700 border-orange-200"
      case "MEDIUM": return "bg-amber-50 text-amber-700 border-amber-200"
      default: return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case "AVAILABLE": return "🟢"
      case "ASSIGNED": return "📋"
      case "EN_ROUTE": return "🚑"
      case "AT_INCIDENT": return "📍"
      case "PATIENT_ONBOARD": return "👤"
      case "HOSPITAL_ARRIVAL": return "🏥"
      case "SANITIZATION": return "🧼"
      case "READY": return "✅"
      default: return "➡️"
    }
  }

  const getPrimaryActionText = (status: string) => {
    switch (status) {
      case "ASSIGNED": return "Start Trip (En Route)"
      case "EN_ROUTE": return "Arrived at Incident"
      case "AT_INCIDENT": return "Patient Onboard"
      case "PATIENT_ONBOARD": return "Arrived at Hospital"
      case "HOSPITAL_ARRIVAL": return "Start Sanitization"
      case "SANITIZATION": return "Ready for Duty"
      case "READY": return "Complete Shift (Go Available)"
      default: return "Update Status"
    }
  }

  const nextActionStatus = nextValidStatuses.find(s => s !== "AVAILABLE" && s !== "ASSIGNED") 
    || (nextValidStatuses.includes("AVAILABLE") && currentStatus === "READY" ? "AVAILABLE" : null)

  if (loading) {
    return (
      <div className="flex flex-col lg:flex-row h-[calc(100vh-8rem)] w-full gap-6 animate-pulse p-1">
        <div className="flex-1 rounded-2xl bg-slate-200 h-64 lg:h-full" />
        <div className="w-full lg:w-96 space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!ambulance) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <EmptyState
          title="No Active Ambulance Assignment"
          description="You currently do not have an active ambulance assignment. Please contact a Fleet Manager or Dispatcher to assign you to a vehicle to begin your shift."
          icon={Truck}
          actionLabel="Refresh Status"
          onAction={fetchAssignment}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] w-full overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm relative -my-4 -mx-4 lg:-my-8 lg:-mx-8">
      {/* ERROR BANNER */}
      {error && (
        <div className="absolute top-4 left-4 right-4 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-bold text-red-500 hover:text-red-700 ml-4">✕</button>
        </div>
      )}

      {/* LEFT SECTION: NAVIGATION MAP */}
      <div className="flex-1 h-64 lg:h-full relative border-r border-slate-200 bg-slate-100 min-h-0">
        {/* LEAFLET MAP ELEMENT */}
        <div id="driver-map" className="w-full h-full z-10" />

        {/* MAP TELEMETRY PILL */}
        {activeMission && routeInfo && (
          <div className="absolute top-4 left-4 z-30 bg-slate-950 text-white rounded-full px-4 py-2 text-xs font-semibold shadow-lg flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{routeInfo.eta_minutes} mins</span>
            </div>
            <span className="h-3 w-px bg-slate-800" />
            <span>{routeInfo.distance_km} km</span>
          </div>
        )}

        {/* RECENTER BUTTON */}
        <button
          onClick={handleRecenter}
          className="absolute bottom-4 left-4 z-30 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-full p-2.5 shadow-md active:scale-95 transition-all"
          title="Recenter Map"
        >
          <Compass className="h-5 w-5" />
        </button>

        {/* FLOATING CONTROLS PANEL */}
        <div className="absolute top-4 right-4 z-30 bg-white border border-slate-200 rounded-xl p-3 shadow-md space-y-2 flex flex-col">
          <label className="flex items-center gap-2 text-xs font-semibold text-emerald-600 cursor-pointer">
            <input
              type="checkbox"
              checked={useDeviceGPS}
              onChange={(e) => setUseDeviceGPS(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <span>Use Device GPS</span>
          </label>
          
          {activeMission && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={simulating}
                onChange={(e) => setSimulating(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
              <span>Simulate Route</span>
            </label>
          )}
        </div>
      </div>

      {/* RIGHT SECTION: OPERATIONAL CONTROL SIDEBAR */}
      <aside className="w-full lg:w-[400px] xl:w-[440px] h-1/2 lg:h-full flex flex-col bg-white overflow-hidden shrink-0 min-h-0">
        
        {/* SHIFT & VEHICLE IDENTIFIER */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Vehicle</span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{ambulance.ambulance_number}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{ambulance.type}</p>
          </div>
          <Badge className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase tracking-wider ${getStatusBadgeVariant(currentStatus)}`}>
            {getStatusEmoji(currentStatus)} {getStatusLabel(currentStatus)}
          </Badge>
        </div>

        {/* SCROLLABLE PANEL ACTIONS */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollable">
          
          {/* UBER STYLE TRIP CONSOLE CARDS */}
          {activeMission ? (
            <div className="space-y-4">
              
              {/* DETAILED TRIP DATA CARD */}
              <div className="border border-slate-200 rounded-2xl bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Navigation className="h-4 w-4 text-slate-400" /> Current Trip Mission
                  </span>
                  <Badge className={`px-2.5 py-0.5 text-[10px] rounded-md font-bold uppercase tracking-wider ${getPriorityBadgeVariant(activeMission.priority)}`}>
                    {activeMission.priority}
                  </Badge>
                </div>

                {/* TRIP TIMELINE */}
                <div className="relative pl-6 space-y-5">
                  <div className="absolute left-2.5 top-1 bottom-1 w-0.5 bg-slate-200" />
                  
                  {/* PICKUP ADDRESS */}
                  <div className="relative">
                    <div className="absolute -left-[21px] top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] shadow-sm font-bold">
                      A
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pickup Request Location</span>
                      <span className="text-xs font-semibold text-slate-800 leading-normal block mt-0.5">
                        {activeMission.pickup_location}
                      </span>
                    </div>
                  </div>

                  {/* DESTINATION HOSPITAL */}
                  <div className="relative">
                    <div className="absolute -left-[21px] top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-900 text-white text-[9px] shadow-sm font-bold">
                      B
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Destination Hospital</span>
                      <span className="text-xs font-semibold text-slate-800 leading-normal block mt-0.5">
                        {ambulance.hospital?.hospital_name || "Khargone District Hospital"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PATIENT INFO */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3 text-xs">
                  <div className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Patient Contact</span>
                    <p className="font-bold text-slate-900 mt-0.5">{activeMission.requester_name}</p>
                  </div>
                </div>
              </div>

              {/* ACTION SHEET */}
              <div className="space-y-3">
                {nextActionStatus ? (
                  <Button
                    onClick={() => {
                      if (nextActionStatus === "AVAILABLE") {
                        if (window.confirm("Complete this mission and return to AVAILABLE status?")) {
                          handleTransition("AVAILABLE")
                        }
                      } else {
                        handleTransition(nextActionStatus)
                      }
                    }}
                    disabled={submitting}
                    className="w-full bg-black hover:bg-slate-800 text-white py-4.5 rounded-xl text-sm font-semibold tracking-tight shadow-md flex items-center justify-center gap-2 transition-all border-none"
                  >
                    <span>{getStatusEmoji(nextActionStatus)}</span>
                    <span>{getPrimaryActionText(currentStatus)}</span>
                  </Button>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400 font-semibold bg-slate-50 rounded-xl border border-slate-100">
                    Mission in progress. Check dispatch console.
                  </div>
                )}

                {/* FALLBACK ABORT / COMPLETE ACTION */}
                {currentStatus !== "AVAILABLE" && currentStatus !== "READY" && nextValidStatuses.includes("AVAILABLE") && (
                  <button
                    onClick={() => {
                      if (window.confirm("Abort current trip mission and return to AVAILABLE standby?")) {
                        handleTransition("AVAILABLE")
                      }
                    }}
                    className="w-full text-center text-xs font-bold text-red-500 hover:text-red-700 mt-1 cursor-pointer transition-colors block py-2"
                  >
                    Abort Trip (Standby)
                  </button>
                )}
              </div>

            </div>
          ) : (
            /* STANDBY STATE */
            <div className="border border-emerald-100 rounded-2xl bg-emerald-50/20 p-5 text-center space-y-3">
              <span className="inline-block p-3 bg-emerald-50 rounded-full text-emerald-600 animate-pulse text-base">🟢</span>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Online & Standby</h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Your ambulance is currently ready. A dispatcher will ping you with a critical emergency route as soon as a request enters the queue.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAssignment}
                className="border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 font-bold h-9 gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Check For Missions
              </Button>
            </div>
          )}

          {/* REMARKS INPUT OR NOTES */}
          {activeMission && (
            <div className="space-y-1.5">
              <label htmlFor="remarks-field" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Operational Remarks
              </label>
              <textarea
                id="remarks-field"
                rows={2}
                placeholder="Add delays, conditions, or incident remarks (optional)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 bg-white text-slate-950 font-medium placeholder-slate-400"
              />
            </div>
          )}

          {/* SESSION AUDIT TRAIL LOG */}
          <div className="space-y-3 border-t border-slate-100 pt-6">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <History className="h-4 w-4 text-slate-400" /> Operational Session Logs
            </h3>
            
            <div className="space-y-4">
              {history.length === 0 ? (
                <p className="text-xs italic text-slate-400">No shift lifecycle updates logged yet.</p>
              ) : (
                <div className="relative pl-5 space-y-4">
                  <div className="absolute left-2 top-0.5 bottom-0.5 w-0.5 bg-slate-100" />
                  
                  {history.slice(0, 5).map((log) => (
                    <div key={log.id} className="relative text-xs leading-normal">
                      <div className="absolute -left-[17px] top-0.5 h-1.5 w-1.5 rounded-full bg-slate-900 border-2 border-white ring-1 ring-slate-200" />
                      <div className="flex items-center justify-between font-medium text-slate-800">
                        <span>
                          {getStatusLabel(log.from_status)} ➔ <strong className="text-slate-950">{getStatusLabel(log.to_status)}</strong>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.changed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {log.remarks && (
                        <p className="text-slate-500 italic text-[11px] mt-0.5">"{log.remarks}"</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* COLLAPSIBLE TRIPS HISTORY */}
          <div className="border-t border-slate-100 pt-5">
            <button
              onClick={() => setTripsExpanded(!tripsExpanded)}
              className="w-full flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider py-1 cursor-pointer hover:text-slate-900 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Map className="h-4 w-4 text-slate-400" /> Shift Trip History ({trips.length})
              </span>
              {tripsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {tripsExpanded && (
              <div className="mt-3 space-y-2.5 max-h-48 overflow-y-auto scrollable py-1">
                {tripsLoading ? (
                  <p className="text-xs italic text-slate-400">Loading trip history...</p>
                ) : trips.length === 0 ? (
                  <p className="text-xs italic text-slate-400">No shift trip records found.</p>
                ) : (
                  trips.map((t) => (
                    <div key={t.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-1.5 text-xs text-slate-700">
                      <div className="flex justify-between items-center">
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">
                          {t.status}
                        </Badge>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {t.start_time ? new Date(t.start_time).toLocaleDateString() : "N/A"}
                        </span>
                      </div>
                      <div className="flex gap-4 font-semibold text-slate-800">
                        <span>Distance: <strong className="text-slate-950">{t.distance_km} km</strong></span>
                        <span>Duration: <strong className="text-slate-950">
                          {t.start_time && t.end_time 
                            ? `${Math.max(0, Math.round((new Date(t.end_time).getTime() - new Date(t.start_time).getTime()) / 60000))} mins`
                            : "0 mins"
                          }
                        </strong></span>
                      </div>
                      {t.summary && (
                        <p className="text-[11px] italic text-slate-500 bg-white border border-slate-100 rounded p-1.5 mt-1 leading-normal">
                          "{t.summary}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </aside>
    </div>
  )
}
