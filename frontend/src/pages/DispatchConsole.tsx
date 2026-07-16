import React, { useState, useEffect, useRef } from "react"
import {
  AlertTriangle,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import api from "../services/api"
// @ts-expect-error - AuthContext is currently .jsx
import { useAuth } from "../context/AuthContext"
import { notify } from "@/components/ui/Toast"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"

interface Station {
  id: string
  station_name: string
  latitude: string
  longitude: string
}

interface Driver {
  id: string
  name: string
  license_number: string
  availability_status: string
}

interface Ambulance {
  id: string
  ambulance_number: string
  type: string
  status: string
  lifecycle_status: string
  current_latitude: string | null
  current_longitude: string | null
  station: Station | null
  active_driver: Driver | null
  distance?: number | null
  eta?: number | null
  readiness_info?: string
  score_breakdown?: {
    base_driver_score: number
    distance_penalty: number
    equipment_score: number
  }
  equipment?: string[]
}

interface EmergencyRequest {
  id: string
  requester_name: string
  contact_number: string
  emergency_type: string
  priority: string
  pickup_location: string
  latitude: string
  longitude: string
  created_at: string
}

interface Mission {
  id: string
  status: string
  driver: Driver
  ambulance: Ambulance
  emergency_request: EmergencyRequest
}

export default function DispatchConsole() {
  const { user } = useAuth()
  const userRole = typeof user?.role === "object" ? user.role?.name : user?.role
  const isAuthorized = ["HOSPITAL_ADMINISTRATOR", "DISPATCHER"].includes(userRole)

  // States
  const [requests, setRequests] = useState<EmergencyRequest[]>([])
  const [missions, setMissions] = useState<Mission[]>([])
  const [nearbyAmbulances, setNearbyAmbulances] = useState<Ambulance[]>([])
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([])
  const [selectedRequest, setSelectedRequest] = useState<EmergencyRequest | null>(null)
  const [selectedAmbulance, setSelectedAmbulance] = useState<Ambulance | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState("")
  const [confirmAbortId, setConfirmAbortId] = useState<string | null>(null)

  // Loading & Error States
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [submittingDispatch, setSubmittingDispatch] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dispatchSuccess, setDispatchSuccess] = useState("")
  const [dispatchError, setDispatchError] = useState("")

  // Recommendation Engine Filter States
  const [useRecommendation, setUseRecommendation] = useState(true)
  const [maxDistance, setMaxDistance] = useState("")
  const [selectedType, setSelectedType] = useState("")
  const [onlyWithDriver, setOnlyWithDriver] = useState(false)
  const [requiredEquipment, setRequiredEquipment] = useState("")

  // Fetch initial data
  const fetchActiveRequests = async () => {
    try {
      const response = await api.get("/emergency-requests/?status=PENDING")
      setRequests(response.data)
    } catch (err) {
      console.error("Error fetching requests:", err)
      setError("Failed to fetch pending requests.")
    } finally {
      setLoadingRequests(false)
    }
  }

  const fetchActiveMissions = async () => {
    try {
      const response = await api.get("/missions/?active=true")
      setMissions(response.data)
    } catch (err) {
      console.error("Error fetching missions:", err)
      setError("Failed to fetch active missions.")
    } finally {
      setLoadingMissions(false)
    }
  }

  const fetchAvailableDrivers = async () => {
    try {
      const response = await api.get("/drivers/?available=true")
      setAvailableDrivers(response.data)
    } catch (err) {
      console.error("Error fetching available drivers:", err)
    }
  }

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!isAuthorized) return
    fetchActiveRequests()
    fetchActiveMissions()
    fetchAvailableDrivers()

    const interval = setInterval(() => {
      fetchActiveRequests()
      fetchActiveMissions()
      fetchAvailableDrivers()
    }, 10000)

    return () => clearInterval(interval)
  }, [isAuthorized])

  const fetchNearbyAmbulances = async () => {
    if (!selectedRequest) return
    setLoadingNearby(true)
    setDispatchError("")
    try {
      let endpoint = `/ambulances/nearby/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`

      if (useRecommendation) {
        endpoint = `/ambulances/recommend/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`
        if (maxDistance) {
          endpoint += `&max_distance=${maxDistance}`
        }
        if (selectedType) {
          endpoint += `&type=${encodeURIComponent(selectedType)}`
        }
        if (onlyWithDriver) {
          endpoint += `&has_driver=true`
        }
        if (requiredEquipment) {
          endpoint += `&required_equipment=${encodeURIComponent(requiredEquipment)}`
        }
      }

      const response = await api.get(endpoint)
      setNearbyAmbulances(response.data)
    } catch (err) {
      console.error("Error fetching recommended ambulances:", err)
      setDispatchError("Could not calculate ambulance recommendations.")
    } finally {
      setLoadingNearby(false)
    }
  }

  // Handle selected request change to search nearby/recommended ambulances
  useEffect(() => {
    setDispatchSuccess("")
    setDispatchError("")
    if (!selectedRequest) {
      setNearbyAmbulances([])
      setSelectedAmbulance(null)
      setSelectedDriverId("")
      return
    }
    fetchNearbyAmbulances()
    setSelectedAmbulance(null)
    setSelectedDriverId("")
  }, [selectedRequest, useRecommendation, maxDistance, selectedType, onlyWithDriver, requiredEquipment])

  // Reset selected driver when the selected ambulance changes
  useEffect(() => {
    setSelectedDriverId("")
  }, [selectedAmbulance])

  // Handle Dispatch submission
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRequest || !selectedAmbulance) return

    // Validation
    const needsDriver = !selectedAmbulance.active_driver
    if (needsDriver && !selectedDriverId) {
      setDispatchError("Please assign an available driver first.")
      return
    }

    setSubmittingDispatch(true)
    setDispatchError("")
    setDispatchSuccess("")

    const payload: any = {
      emergency_request_id: selectedRequest.id,
      ambulance_id: selectedAmbulance.id,
    }

    if (needsDriver && selectedDriverId) {
      payload.driver_id = selectedDriverId
    }

    try {
      await api.post("/missions/", payload)
      const successMsg = `Successfully dispatched ${selectedAmbulance.ambulance_number}!`
      setDispatchSuccess(successMsg)
      notify.success(successMsg)

      // Refresh console lists
      fetchActiveRequests()
      fetchActiveMissions()
      fetchAvailableDrivers()

      // Reset selections
      setSelectedRequest(null)
      setSelectedAmbulance(null)
      setSelectedDriverId("")
    } catch (err: any) {
      console.error("Dispatch error:", err)
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.ambulance_id?.[0] ||
        err.response?.data?.driver_id?.[0] ||
        "Failed to dispatch mission."
      setDispatchError(msg)
      notify.error(msg)
    } finally {
      setSubmittingDispatch(false)
    }
  }

  // Handle driver assignment on-the-fly
  const handleAssignDriver = async (driverId: string) => {
    if (!selectedAmbulance || !driverId) return

    setDispatchError("")
    setDispatchSuccess("")

    try {
      await api.post(`/ambulances/${selectedAmbulance.id}/assign-driver/`, {
        driver_id: driverId,
      })
      const msg = `Driver assigned to ${selectedAmbulance.ambulance_number} successfully!`
      setDispatchSuccess(msg)
      notify.success(msg)

      setSelectedDriverId(driverId)
      fetchAvailableDrivers()

      // Refresh nearby/recommended list
      if (selectedRequest) {
        let endpoint = `/ambulances/nearby/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`
        if (useRecommendation) {
          endpoint = `/ambulances/recommend/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`
          if (maxDistance) {
            endpoint += `&max_distance=${maxDistance}`
          }
          if (selectedType) {
            endpoint += `&type=${encodeURIComponent(selectedType)}`
          }
          if (onlyWithDriver) {
            endpoint += `&has_driver=true`
          }
          if (requiredEquipment) {
            endpoint += `&required_equipment=${encodeURIComponent(requiredEquipment)}`
          }
        }
        const response = await api.get(endpoint)
        const updatedList = response.data as Ambulance[]
        setNearbyAmbulances(updatedList)

        // Find the updated selected ambulance
        const updatedSelected = updatedList.find((amb) => amb.id === selectedAmbulance.id)
        if (updatedSelected) {
          setSelectedAmbulance(updatedSelected)
        }
      }
    } catch (err: any) {
      console.error("Failed to assign driver:", err)
      const msg =
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.detail ||
        "Failed to assign driver."
      setDispatchError(msg)
      notify.error(msg)
      setSelectedDriverId("")
    }
  }

  // Transition mission status
  const handleTransitionMission = async (missionId: string, nextStatus: string) => {
    try {
      await api.patch(`/missions/${missionId}/`, { status: nextStatus })
      notify.success(`Mission status updated to ${nextStatus.replace("_", " ")}`)
      fetchActiveMissions()
      fetchActiveRequests()
    } catch (err: any) {
      console.error("Mission status update failed:", err)
      notify.error(err.response?.data?.detail || "Failed to update mission status.")
    }
  }

  // Map and Tracking States
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any>(null)
  const routeRef = useRef<any>(null)
  const hasFittedBoundsRef = useRef(false)
  const hasFittedRouteRef = useRef(false)
  const [activeTrackedMission, setActiveTrackedMission] = useState<Mission | null>(null)
  const [trackedMissionRoute, setTrackedMissionRoute] = useState<any>(null)

  // Reset auto-fitting flags when selections change
  useEffect(() => {
    hasFittedBoundsRef.current = false
  }, [selectedRequest?.id, selectedAmbulance?.id, activeTrackedMission?.id])

  useEffect(() => {
    hasFittedRouteRef.current = false
  }, [activeTrackedMission?.id])

  // Initialize Map
  useEffect(() => {
    if (!isAuthorized || !(window as any).L) return
    const mapContainer = document.getElementById("dispatch-map")
    if (!mapContainer) return

    let mapInstance: any = null

    if (!mapRef.current) {
      try {
        mapInstance = (window as any).L.map("dispatch-map").setView([21.8206, 75.6094], 12);
        (window as any).L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(mapInstance)

        markersRef.current = (window as any).L.layerGroup().addTo(mapInstance)
        mapRef.current = mapInstance
      } catch (err) {
        console.error("Error initializing map:", err)
      }
    }

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch (err) {
          console.error("Error destroying map:", err)
        }
        mapRef.current = null
        markersRef.current = null
      }
    }
  }, [isAuthorized])

  // Update Markers when selections change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return
    const markers = markersRef.current
    markers.clearLayers()

    const bounds: [number, number][] = []

    // Selected Incident Marker
    if (selectedRequest) {
      const reqLat = parseFloat(selectedRequest.latitude)
      const reqLon = parseFloat(selectedRequest.longitude);
      if (!isNaN(reqLat) && !isNaN(reqLon)) {
        (window as any).L.circleMarker([reqLat, reqLon], {
          radius: 10,
          fillColor: "#ef4444",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        })
          .addTo(markers)
          .bindPopup(
            `<strong>Incident: ${selectedRequest.emergency_type}</strong><br/>Location: ${selectedRequest.pickup_location}<br/>Priority: ${selectedRequest.priority}`
          )
        bounds.push([reqLat, reqLon])
      }
    }

    // Recommended Ambulances Markers
    nearbyAmbulances.forEach((amb) => {
      const lat =
        amb.current_latitude !== null
          ? parseFloat(amb.current_latitude)
          : amb.station
          ? parseFloat(amb.station.latitude)
          : null
      const lon =
        amb.current_longitude !== null
          ? parseFloat(amb.current_longitude)
          : amb.station
          ? parseFloat(amb.station.longitude)
          : null

      if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
        const isSelected = selectedAmbulance?.id === amb.id;
        (window as any).L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: isSelected ? "#000000" : "#3b82f6",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        })
          .addTo(markers)
          .bindPopup(
            `<strong>Ambulance: ${amb.ambulance_number}</strong><br/>Status: ${amb.status} [${amb.lifecycle_status}]<br/>Type: ${amb.type}<br/>Distance: ${
              amb.distance !== null ? `${amb.distance} km` : "N/A"
            }`
          )
        bounds.push([lat, lon])
      }
    })

    // Active Missions Markers
    missions.forEach((mission) => {
      const amb = mission.ambulance
      if (!amb) return
      const lat =
        amb.current_latitude !== null
          ? parseFloat(amb.current_latitude)
          : amb.station
          ? parseFloat(amb.station.latitude)
          : null
      const lon =
        amb.current_longitude !== null
          ? parseFloat(amb.current_longitude)
          : amb.station
          ? parseFloat(amb.station.longitude)
          : null

      if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
        const isTracked = activeTrackedMission?.id === mission.id;
        (window as any).L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: isTracked ? "#10b981" : "#64748b",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        })
          .addTo(markers)
          .bindPopup(
            `<strong>Mission Ambulance: ${amb.ambulance_number}</strong><br/>Status: ${mission.status}<br/>Driver: ${
              mission.driver?.name || "N/A"
            }`
          )
        bounds.push([lat, lon])
      }
    })

    if (bounds.length > 0 && !hasFittedBoundsRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] })
      hasFittedBoundsRef.current = true
    }
  }, [selectedRequest, nearbyAmbulances, selectedAmbulance, missions, activeTrackedMission])

  // Handle Tracked Route
  useEffect(() => {
    if (!mapRef.current) return

    if (routeRef.current) {
      mapRef.current.removeLayer(routeRef.current)
      routeRef.current = null
    }

    if (!activeTrackedMission) {
      setTrackedMissionRoute(null)
      return
    }

    const fetchRoute = async () => {
      try {
        const response = await api.get(`/missions/${activeTrackedMission.id}/route/`)
        const routeData = response.data
        setTrackedMissionRoute(routeData)

        if (routeData.route && routeData.route.length > 0) {
          const polyline = (window as any).L.polyline(routeData.route, {
            color: "#10b981",
            weight: 4,
            opacity: 0.8,
            dashArray: "5, 10",
          }).addTo(mapRef.current)
          routeRef.current = polyline

          if (!hasFittedRouteRef.current) {
            mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] })
            hasFittedRouteRef.current = true
          }
        }
      } catch (err) {
        console.error("Error fetching mission route:", err)
      }
    }

    fetchRoute()
    const interval = setInterval(fetchRoute, 8000)
    return () => clearInterval(interval)
  }, [activeTrackedMission])

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-border max-w-md mx-auto mt-12 shadow-soft text-center">
        <AlertTriangle className="h-12 w-12 text-emergency mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500">
          You do not have permissions to access the Operational Dispatch Console.
        </p>
      </div>
    )
  }

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "CRITICAL":
        return <Badge variant="destructive" className="uppercase text-[10px]">Critical</Badge>
      case "HIGH":
        return <Badge variant="default" className="bg-orange-500 text-white border-transparent uppercase text-[10px]">High</Badge>
      case "MEDIUM":
        return <Badge variant="info" className="uppercase text-[10px]">Medium</Badge>
      case "LOW":
        return <Badge variant="secondary" className="uppercase text-[10px]">Low</Badge>
      default:
        return <Badge variant="outline" className="uppercase text-[10px]">{p}</Badge>
    }
  }

  const getMissionStatusStep = (status: string) => {
    switch (status) {
      case "ASSIGNED":
        return 1
      case "EN_ROUTE":
        return 2
      case "ON_SITE":
      case "AT_INCIDENT":
        return 3
      case "TRANSPORTING":
      case "PATIENT_ONBOARD":
        return 4
      case "ARRIVED_HOSPITAL":
      case "HOSPITAL_ARRIVAL":
        return 5
      case "SANITIZATION":
        return 6
      case "READY":
        return 7
      default:
        return 1
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full xl:h-[calc(100vh-120px)] h-auto min-h-0">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl flex items-center justify-between shadow-soft">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="font-bold text-red-900 hover:text-red-950">✕</button>
        </div>
      )}

      {/* 3-Column Console Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:h-full h-auto min-h-0 xl:overflow-hidden overflow-visible">
        
        {/* Left Column: Active Incidents Queue */}
        <aside className="xl:col-span-3 xl:h-full h-[500px] flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Pending Queue ({requests.length})
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchActiveRequests}
              className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg"
              title="Refresh incidents"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto scrollable space-y-3 pr-1">
            {loadingRequests ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading queue...</div>
            ) : requests.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No pending emergencies.
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequest(req)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer text-left flex flex-col gap-2 ${
                    selectedRequest?.id === req.id
                      ? "border-slate-900 bg-slate-50/50 ring-1 ring-slate-900"
                      : "border-slate-100 hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-sm font-bold text-slate-900">{req.emergency_type}</span>
                    {getPriorityBadge(req.priority)}
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{req.pickup_location}</span>
                  </p>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-50 pt-2 mt-1">
                    <span>
                      {new Date(req.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="truncate max-w-[80px]">by {req.requester_name}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Middle Column: Telemetry Map & Scoring Engine */}
        <section className="xl:col-span-5 xl:h-full h-auto min-h-[500px] flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Map & Dispatch Intake
            </h3>
            {selectedRequest && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-500 hover:text-slate-900 font-semibold"
                onClick={() => setSelectedRequest(null)}
              >
                ✕ Deselect Case
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollable space-y-4 pr-1">
            {/* Live Map Panel */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Telemetry Operations Map
                </span>
                {activeTrackedMission && (
                  <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                    <span>Tracking: {activeTrackedMission.ambulance?.ambulance_number}</span>
                    {trackedMissionRoute && (
                      <span className="text-slate-400 font-medium">
                        ({trackedMissionRoute.distance_km} km | {trackedMissionRoute.eta_minutes} mins)
                      </span>
                    )}
                    <button
                      onClick={() => setActiveTrackedMission(null)}
                      className="text-red-500 hover:text-red-700 font-bold ml-1"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <div
                id="dispatch-map"
                className="h-[350px] sm:h-[400px] xl:h-60 rounded-xl border border-slate-200 bg-slate-50 z-10 shadow-inner"
              ></div>
            </div>

            {/* If no request is selected */}
            {!selectedRequest ? (
              <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                Select an incident from the left queue to compute ambulance recommendations.
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {/* Scoring Recommendations Panel */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Recommendation Scores
                    </span>
                    <button
                      onClick={() => setUseRecommendation(!useRecommendation)}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      {useRecommendation ? "Switch to Nearby List" : "Switch to scoring matrix"}
                    </button>
                  </div>

                  {/* Recommendation Filters */}
                  {useRecommendation && (
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold uppercase">Max Dist (km)</label>
                        <Input
                          type="number"
                          value={maxDistance}
                          onChange={(e) => setMaxDistance(e.target.value)}
                          placeholder="e.g. 15"
                          className="h-8 text-xs mt-1 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold uppercase">Vehicle Type</label>
                        <select
                          value={selectedType}
                          onChange={(e) => setSelectedType(e.target.value)}
                          className="w-full h-8 mt-1 text-xs border border-border rounded-lg px-2 bg-white outline-none focus:ring-1 focus:ring-slate-900"
                        >
                          <option value="">All Types</option>
                          <option value="ALS">ALS (Advanced)</option>
                          <option value="BLS">BLS (Basic)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Scoring Results List */}
                  {loadingNearby ? (
                    <div className="py-6 text-center text-xs text-slate-400">Computing scores...</div>
                  ) : nearbyAmbulances.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 border border-slate-100 rounded-xl">
                      No vehicles found matching criteria.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {nearbyAmbulances.slice(0, 3).map((amb) => {
                        const isSelected = selectedAmbulance?.id === amb.id
                        const isAvailable = amb.status === "ACTIVE" && amb.lifecycle_status === "AVAILABLE"
                        const needsDriver = !amb.active_driver
                        return (
                          <div
                            key={amb.id}
                            onClick={() => {
                              if (!isSelected) {
                                setSelectedAmbulance(amb)
                              }
                            }}
                            className={`p-4 rounded-xl border transition-all flex flex-col gap-2.5 ${
                              isSelected
                                ? "border-slate-900 bg-slate-50/50 ring-1 ring-slate-900 cursor-default"
                                : "border-slate-100 hover:border-slate-200 cursor-pointer"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-slate-900">
                                🚑 {amb.ambulance_number}
                              </span>
                              {amb.distance !== undefined && (
                                <span className="text-xs font-semibold text-slate-600">
                                  {amb.distance !== null ? `${amb.distance} km` : "N/A"} ({amb.eta !== null ? `${amb.eta}m` : "N/A"} ETA)
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 items-center">
                              <Badge variant="outline" className="text-[10px] text-slate-500 font-semibold">{amb.type}</Badge>
                              {isAvailable ? (
                                <Badge variant="success" className="text-[9px] uppercase tracking-wider">Available</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[9px] uppercase tracking-wider">{amb.status} - {amb.lifecycle_status}</Badge>
                              )}
                              {amb.active_driver ? (
                                <Badge variant="info" className="text-[9px] uppercase tracking-wider">Driver assigned</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[9px] uppercase tracking-wider">No driver</Badge>
                              )}
                            </div>

                            {/* Scoring Breakdown */}
                            {useRecommendation && amb.score_breakdown && (
                              <div className="grid grid-cols-3 gap-2 bg-white/70 border border-slate-100 p-2 rounded-lg mt-0.5 text-[10px] text-slate-500">
                                <div>
                                  Driver: <strong className="text-slate-900">{amb.score_breakdown.base_driver_score}</strong>
                                </div>
                                <div>
                                  Dist Penalty: <strong className="text-red-500">-{Number(amb.score_breakdown.distance_penalty).toFixed(1)}</strong>
                                </div>
                                <div>
                                  Equipment: <strong className="text-emerald-600">+{Number(amb.score_breakdown.equipment_score).toFixed(1)}</strong>
                                </div>
                              </div>
                            )}

                            {/* Expanded Dispatch controls for Selected ambulance */}
                            {isSelected && (
                              <div
                                className="pt-3 border-t border-slate-200 mt-2 space-y-3"
                                onClick={(e) => e.stopPropagation()} // Prevent deselections
                              >
                                {needsDriver && (
                                  <div className="space-y-1.5 bg-amber-50/50 border border-amber-100 p-3 rounded-xl">
                                    <label className="block text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                                      Assign Available Driver
                                    </label>
                                    <p className="text-[11px] text-amber-700 leading-normal">
                                      This ambulance has no active driver. Select one below to proceed.
                                    </p>
                                    <select
                                      value={selectedDriverId}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        setSelectedDriverId(val)
                                        if (val) {
                                          handleAssignDriver(val)
                                        }
                                      }}
                                      className="w-full h-8.5 text-xs border border-amber-200 rounded-lg px-2 bg-white outline-none focus:ring-1 focus:ring-amber-500"
                                    >
                                      <option value="">-- Select Available Driver --</option>
                                      {availableDrivers.map((drv) => (
                                        <option key={drv.id} value={drv.id}>
                                          👤 {drv.name} (License: {drv.license_number})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                {dispatchError && (
                                  <div className="text-xs text-red-500 font-medium">{dispatchError}</div>
                                )}
                                {dispatchSuccess && (
                                  <div className="text-xs text-emerald-600 font-medium">{dispatchSuccess}</div>
                                )}

                                <div className="flex gap-2">
                                  <Button
                                    onClick={handleDispatch}
                                    className="flex-1 font-semibold text-xs h-9 bg-slate-900 text-white"
                                    disabled={submittingDispatch || (needsDriver && !selectedDriverId)}
                                  >
                                    {submittingDispatch ? "Dispatching..." : `🚀 Confirm Dispatch`}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setSelectedAmbulance(null)}
                                    className="text-xs h-9 text-slate-500 hover:text-slate-900"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Active Missions Monitor */}
        <section className="xl:col-span-4 xl:h-full h-[500px] flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 shrink-0">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Ongoing Missions ({missions.length})
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchActiveMissions}
              className="h-8 w-8 text-slate-400 hover:text-slate-600 rounded-lg"
              title="Refresh missions"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto scrollable space-y-4 pr-1">
            {loadingMissions ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading missions...</div>
            ) : missions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No active missions currently.
              </div>
            ) : (
              missions.map((mission) => {
                const step = getMissionStatusStep(mission.status)
                const isTracked = activeTrackedMission?.id === mission.id
                return (
                  <div
                    key={mission.id}
                    className="border border-slate-100 p-4 rounded-xl flex flex-col gap-3 text-left hover:border-slate-200 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          Mission: {mission.ambulance?.ambulance_number}
                        </h4>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Driver: {mission.driver?.name}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase border-slate-200">
                        {mission.status}
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1 bg-slate-50/50 p-2.5 rounded-lg">
                      <div>
                        Patient: <strong className="text-slate-800">{mission.emergency_request?.requester_name}</strong>
                      </div>
                      <div>
                        Incident: <strong className="text-slate-800">{mission.emergency_request?.emergency_type}</strong>
                      </div>
                      <div className="truncate">
                        Pickup: 📍 <strong className="text-slate-800">{mission.emergency_request?.pickup_location}</strong>
                      </div>
                    </div>

                    {/* Progress Stepper */}
                    <div className="space-y-1 mt-1">
                      <div className="flex justify-between items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${step >= 1 ? "bg-emerald-500" : "bg-slate-200"}`} title="Assigned"></div>
                        <div className={`h-0.5 flex-1 ${step >= 2 ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                        <div className={`h-2 w-2 rounded-full ${step >= 2 ? "bg-emerald-500" : "bg-slate-200"}`} title="En Route"></div>
                        <div className={`h-0.5 flex-1 ${step >= 3 ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                        <div className={`h-2 w-2 rounded-full ${step >= 3 ? "bg-emerald-500" : "bg-slate-200"}`} title="At Scene"></div>
                        <div className={`h-0.5 flex-1 ${step >= 4 ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                        <div className={`h-2 w-2 rounded-full ${step >= 4 ? "bg-emerald-500" : "bg-slate-200"}`} title="Onboard"></div>
                        <div className={`h-0.5 flex-1 ${step >= 5 ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                        <div className={`h-2 w-2 rounded-full ${step >= 5 ? "bg-emerald-500" : "bg-slate-200"}`} title="Hospital"></div>
                        <div className={`h-0.5 flex-1 ${step >= 6 ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                        <div className={`h-2 w-2 rounded-full ${step >= 6 ? "bg-emerald-500" : "bg-slate-200"}`} title="Sanitizing"></div>
                        <div className={`h-0.5 flex-1 ${step >= 7 ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                        <div className={`h-2 w-2 rounded-full ${step >= 7 ? "bg-emerald-500" : "bg-slate-200"}`} title="Ready"></div>
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-semibold">
                        <span>Assigned</span>
                        <span>En Route</span>
                        <span>Scene</span>
                        <span>Onboard</span>
                        <span>Hospital</span>
                        <span>Sanitize</span>
                        <span>Ready</span>
                      </div>
                    </div>

                    {/* Mission Actions */}
                    <div className="flex flex-wrap gap-2 border-t border-slate-50 pt-3 mt-1 justify-between">
                      <Button
                        variant={isTracked ? "success" : "outline"}
                        size="sm"
                        onClick={() => setActiveTrackedMission(isTracked ? null : mission)}
                        className="text-[10.5px] h-8 font-semibold"
                      >
                        📍 {isTracked ? "Tracking Live" : "Track Route"}
                      </Button>

                      {/* Stepper advancement controls */}
                      {mission.status === "ASSIGNED" && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "EN_ROUTE")}
                          className="text-[10.5px] h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                          size="sm"
                        >
                          Depart
                        </Button>
                      )}
                      {mission.status === "EN_ROUTE" && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "AT_INCIDENT")}
                          className="text-[10.5px] h-8 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                          size="sm"
                        >
                          On Scene
                        </Button>
                      )}
                      {(mission.status === "AT_INCIDENT" || mission.status === "ON_SITE") && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "PATIENT_ONBOARD")}
                          className="text-[10.5px] h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                          size="sm"
                        >
                          Onboard
                        </Button>
                      )}
                      {(mission.status === "PATIENT_ONBOARD" || mission.status === "TRANSPORTING") && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "HOSPITAL_ARRIVAL")}
                          className="text-[10.5px] h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                          size="sm"
                        >
                          At Hospital
                        </Button>
                      )}
                      {(mission.status === "HOSPITAL_ARRIVAL" || mission.status === "ARRIVED_HOSPITAL") && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "SANITIZATION")}
                          className="text-[10.5px] h-8 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                          size="sm"
                        >
                          Sanitize
                        </Button>
                      )}
                      {mission.status === "SANITIZATION" && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "READY")}
                          className="text-[10.5px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          size="sm"
                        >
                          Complete Sanitize
                        </Button>
                      )}
                      {mission.status === "READY" && (
                        <Button
                          onClick={() => handleTransitionMission(mission.id, "COMPLETED")}
                          className="text-[10.5px] h-8 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                          size="sm"
                        >
                          Complete Mission
                        </Button>
                      )}

                      {confirmAbortId === mission.id ? (
                        <div className="flex gap-1.5 items-center">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              handleTransitionMission(mission.id, "CANCELLED")
                              setConfirmAbortId(null)
                            }}
                            className="text-[10.5px] h-8 font-semibold animate-pulse"
                          >
                            Confirm Abort?
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmAbortId(null)}
                            className="text-[10.5px] h-8 text-slate-500 font-semibold"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmAbortId(mission.id)}
                          className="text-[10.5px] h-8 text-red-500 hover:text-red-700 hover:bg-red-50 font-semibold"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Abort
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
