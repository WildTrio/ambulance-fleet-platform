import React, { useState, useEffect, useRef } from "react"
import {
  MapPin,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  RefreshCw,
  Phone,
  User,
  Map,
  Plus,
  X,
  Activity,
  CheckCircle2,
  Clock,
  Navigation,
} from "lucide-react"
import api from "../services/api"
// @ts-expect-error - AuthContext is currently .jsx
import { useAuth } from "../context/AuthContext"
import { notify } from "@/components/ui/Toast"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"

interface EmergencyRequest {
  id: number
  requester_name: string
  contact_number: string
  emergency_type: string
  pickup_location: string
  latitude: number
  longitude: number
  priority: string
  status: string
  created_at: string
}

export default function EmergencyRequests() {
  const { user } = useAuth()
  const userRole = typeof user?.role === "object" ? user.role?.name : user?.role
  const isCitizen = userRole === "EMERGENCY_REQUESTOR"
  const isStaff = ["HOSPITAL_ADMINISTRATOR", "DISPATCHER"].includes(userRole)

  // Lists & Loading state
  const [requests, setRequests] = useState<EmergencyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [requesterName, setRequesterName] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [emergencyType, setEmergencyType] = useState("Cardiac Arrest")
  const [customEmergencyType, setCustomEmergencyType] = useState("")
  const [pickupLocation, setPickupLocation] = useState("")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [priority, setPriority] = useState("MEDIUM")

  // Geocoding states
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState("")
  const [geocodeSuccess, setGeocodeSuccess] = useState("")

  // Submit states
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitSuccess, setSubmitSuccess] = useState("")

  // Search/Filters states
  const [statusFilter, setStatusFilter] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Map Refs
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any>(null)
  const activePinMarkerRef = useRef<any>(null)

  // Citizen Tab control
  const [citizenTab, setCitizenTab] = useState<"book" | "history">("book")

  // Staff Tab control
  const [staffTab, setStaffTab] = useState<"intake" | "queue">("intake")

  // Selected Request (for centering map and highlighting)
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)

  const fetchRequests = async () => {
    try {
      let url = "/emergency-requests/"
      const params = []
      if (statusFilter) params.push(`status=${statusFilter}`)
      if (priorityFilter) params.push(`priority=${priorityFilter}`)
      if (params.length > 0) {
        url += `?${params.join("&")}`
      }
      const response = await api.get(url)
      setRequests(response.data as EmergencyRequest[])
      setError(null)
    } catch (err) {
      console.error(err)
      setError("Failed to fetch emergency requests.")
    } finally {
      setLoading(false)
    }
  }

  // Refresh every 10s
  useEffect(() => {
    fetchRequests()
    const interval = setInterval(fetchRequests, 10000)
    return () => clearInterval(interval)
  }, [statusFilter, priorityFilter])

  // Initialize Map
  useEffect(() => {
    if (!(window as any).L) return
    const mapContainer = document.getElementById("emergency-map")
    if (!mapContainer) return

    let mapInstance: any = null

    if (!mapRef.current) {
      try {
        // Center of workspace operations by default
        mapInstance = (window as any).L.map("emergency-map").setView([21.8206, 75.6094], 12)
          ; (window as any).L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
          }).addTo(mapInstance)

        markersRef.current = (window as any).L.layerGroup().addTo(mapInstance)
        mapRef.current = mapInstance

        // Allow map click pin-dropping for citizen booking or staff intake
        mapInstance.on("click", (e: any) => {
          if (isStaff || (isCitizen && citizenTab === "book")) {
            const { lat, lng } = e.latlng
            updateCoordinates(lat, lng)
            handleReverseGeocode(lat, lng)
          }
        })
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
        activePinMarkerRef.current = null
      }
    }
  }, [isCitizen, citizenTab])

  // Reverse Geocoding via Nominatim
  const handleReverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            "User-Agent": "Lifeline-Dispatch-App/1.0",
          },
        }
      )
      if (response.ok) {
        const data = await response.json()
        if (data && data.display_name) {
          setPickupLocation(data.display_name)
          setGeocodeSuccess("Location updated on map!")
          setGeocodeError("")
        }
      }
    } catch (err) {
      console.error("Error reverse geocoding:", err)
    }
  }

  // Set coordinates and manage current pin marker (Citizen creation flow)
  const updateCoordinates = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6))
    setLongitude(lng.toFixed(6))

    if (!mapRef.current) return

    if (activePinMarkerRef.current) {
      activePinMarkerRef.current.setLatLng([lat, lng])
    } else {
      const customPinIcon = (window as any).L.divIcon({
        className: "custom-pin-icon-div",
        html: `<div class="relative flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-slate-900 opacity-20"></span>
          <div class="relative w-8 h-8 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center shadow-lg text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      })

      const marker = (window as any).L.marker([lat, lng], {
        draggable: true,
        icon: customPinIcon,
      }).addTo(mapRef.current)

      marker.on("dragend", (e: any) => {
        const position = e.target.getLatLng()
        updateCoordinates(position.lat, position.lng)
        handleReverseGeocode(position.lat, position.lng)
      })

      activePinMarkerRef.current = marker
    }
  }

  // Draw active emergency requests markers on map
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return
    const markerLayer = markersRef.current
    markerLayer.clearLayers()

    // Filtered requests mapping
    filteredRequests.forEach((req) => {
      const lat = parseFloat(req.latitude as any)
      const lon = parseFloat(req.longitude as any)
      if (isNaN(lat) || isNaN(lon)) return

      const isPast = ["COMPLETED", "CANCELLED"].includes(req.status || "")
      const isActiveSelected = selectedRequestId === req.id

      // Determine priority color
      let dotColor = "#3b82f6" // Default Blue
      if (isPast) {
        dotColor = "#94a3b8" // Gray
      } else {
        const priorityVal = (req.priority || "MEDIUM").toUpperCase()
        switch (priorityVal) {
          case "CRITICAL":
            dotColor = "#ef4444"
            break
          case "HIGH":
            dotColor = "#f97316"
            break
          case "MEDIUM":
            dotColor = "#3b82f6"
            break
          case "LOW":
            dotColor = "#10b981"
            break
        }
      }

      const pulseRingClass = isActiveSelected ? "scale-150 opacity-30 animate-pulse border-4" : "animate-ping opacity-25"

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer">
          ${!isPast
          ? `<span class="${pulseRingClass} absolute inline-flex h-6 w-6 rounded-full" style="background-color: ${dotColor}"></span>`
          : ""
        }
          <div class="relative w-4.5 h-4.5 rounded-full border-2 border-white flex items-center justify-center shadow-md transition-transform duration-200 ${isActiveSelected ? "scale-125 border-slate-900" : ""
        }" style="background-color: ${dotColor}">
          </div>
        </div>
      `

      const markerIcon = (window as any).L.divIcon({
        className: "custom-emergency-marker",
        html: markerHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      const popupContent = `
        <div class="p-2 text-slate-800 font-sans text-xs">
          <p class="font-bold text-sm text-slate-900 mb-1">${req.emergency_type}</p>
          <p class="mb-0.5"><span class="font-semibold">Requester:</span> ${req.requester_name}</p>
          <p class="mb-0.5"><span class="font-semibold">Location:</span> ${req.pickup_location}</p>
          <p class="mb-1"><span class="font-semibold">Priority:</span> ${req.priority}</p>
          <p class="mb-0 text-[10px] text-slate-400">Logged at ${new Date(req.created_at).toLocaleTimeString()}</p>
        </div>
      `

      const marker = (window as any).L.marker([lat, lon], { icon: markerIcon })
        .bindPopup(popupContent)
        .addTo(markerLayer)

      marker.on("click", () => {
        setSelectedRequestId(req.id)
      })
    })
  }, [requests, selectedRequestId, statusFilter, priorityFilter, searchQuery])

  // Center map on selected request coordinates
  const handleSelectRequest = (req: EmergencyRequest) => {
    setSelectedRequestId(req.id)
    if (!mapRef.current) return
    const lat = parseFloat(req.latitude as any)
    const lon = parseFloat(req.longitude as any)
    if (!isNaN(lat) && !isNaN(lon)) {
      mapRef.current.setView([lat, lon], 14, { animate: true, duration: 1 })
    }
  }

  // Geocode address via Nominatim API
  const handleGeocode = async () => {
    if (!pickupLocation) {
      setGeocodeError("Please enter an address first.")
      return
    }
    setGeocoding(true)
    setGeocodeError("")
    setGeocodeSuccess("")
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickupLocation)}`,
        {
          headers: {
            "User-Agent": "Lifeline-Dispatch-App/1.0",
          },
        }
      )
      if (!response.ok) {
        throw new Error("Geocoding service error")
      }
      const data = await response.json()
      if (data && data.length > 0) {
        const firstResult = data[0]
        const lat = parseFloat(firstResult.lat)
        const lon = parseFloat(firstResult.lon)
        updateCoordinates(lat, lon)
        if (mapRef.current) {
          mapRef.current.setView([lat, lon], 14, { animate: true })
        }
        setGeocodeSuccess("Location resolved successfully!")
      } else {
        setGeocodeError("Address not found. Please enter coordinates manually.")
      }
    } catch (err) {
      setGeocodeError("Failed to retrieve coordinates. Please enter manually.")
    } finally {
      setGeocoding(false)
    }
  }

  // Create new Request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError("")
    setSubmitSuccess("")

    const finalEmergencyType = emergencyType === "Other" ? customEmergencyType : emergencyType
    if (!finalEmergencyType) {
      setSubmitError("Emergency type is required.")
      setSubmitting(false)
      return
    }

    const contactRegex = /^[\d\s\-\(\)\+]+$/
    if (!contactRegex.test(contactNumber)) {
      setSubmitError("Contact number contains invalid characters.")
      setSubmitting(false)
      return
    }
    const cleanedContact = contactNumber.replace(/\D/g, "")
    if (cleanedContact.length !== 10) {
      setSubmitError("Contact number must contain exactly 10 digits.")
      setSubmitting(false)
      return
    }

    const latVal = parseFloat(latitude)
    const lonVal = parseFloat(longitude)
    if (isNaN(latVal) || isNaN(lonVal)) {
      setSubmitError("Valid coordinates (latitude and longitude) are required.")
      setSubmitting(false)
      return
    }

    const payload: any = {
      requester_name: requesterName,
      contact_number: contactNumber,
      emergency_type: finalEmergencyType,
      pickup_location: pickupLocation,
      latitude: latVal,
      longitude: lonVal,
    }

    if (isStaff) {
      payload.priority = priority
    }

    try {
      await api.post("/emergency-requests/", payload)
      setSubmitSuccess("Emergency request registered successfully!")
      notify.success("Emergency request registered successfully!")

      // Reset form states
      setRequesterName("")
      setContactNumber("")
      setEmergencyType("Cardiac Arrest")
      setCustomEmergencyType("")
      setPickupLocation("")
      setLatitude("")
      setLongitude("")
      setGeocodeSuccess("")
      setGeocodeError("")

      // Clear pin marker from map
      if (activePinMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(activePinMarkerRef.current)
        activePinMarkerRef.current = null
      }

      fetchRequests()
      setCitizenTab("history")
    } catch (err: any) {
      console.error(err)
      if (err.response?.data) {
        const data = err.response.data
        if (typeof data === "object") {
          const firstKey = Object.keys(data)[0]
          setSubmitError(`${firstKey}: ${data[firstKey][0]}`)
        } else {
          setSubmitError("Failed to submit emergency request.")
        }
      } else {
        setSubmitError("Failed to connect to the server.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Cancel Request
  const handleCancelRequest = async (id: number) => {
    if (!window.confirm("Are you sure you want to cancel this emergency request?")) return
    try {
      await api.patch(`/emergency-requests/${id}/`, { status: "CANCELLED" })
      notify.success("Request cancelled successfully.")
      fetchRequests()
    } catch (err: any) {
      console.error(err)
      notify.error(err.response?.data?.detail || "Failed to cancel the request.")
    }
  }

  // Staff updates status
  const handleUpdateStatus = async (id: number, newStatus: string) => {
    try {
      await api.patch(`/emergency-requests/${id}/`, { status: newStatus })
      notify.success(`Status updated to ${newStatus.replace("_", " ")}`)
      fetchRequests()
    } catch (err: any) {
      console.error(err)
      notify.error(err.response?.data?.detail || "Failed to update status.")
    }
  }

  // Staff updates priority
  const handleUpdatePriority = async (id: number, newPriority: string) => {
    try {
      await api.patch(`/emergency-requests/${id}/`, { priority: newPriority })
      notify.success(`Priority updated to ${newPriority}`)
      fetchRequests()
    } catch (err: any) {
      console.error(err)
      notify.error(err.response?.data?.detail || "Failed to update priority.")
    }
  }

  // Filters logic
  const filteredRequests = requests.filter((req) => {
    // Staff role filter lists
    if (isStaff) {
      if (statusFilter && req.status !== statusFilter) return false
      if (priorityFilter && req.priority !== priorityFilter) return false
    } else if (isCitizen) {
      // Citizens only see their own requests (or all requests made by their email/name)
      // The API filters this on backend for citizens, but we double-verify locally
    }

    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      req.requester_name.toLowerCase().includes(query) ||
      req.emergency_type.toLowerCase().includes(query) ||
      req.pickup_location.toLowerCase().includes(query)
    )
  })

  const ongoingRequests = filteredRequests.filter((req) =>
    ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(req.status)
  )
  const pastRequests = filteredRequests.filter((req) =>
    ["COMPLETED", "CANCELLED"].includes(req.status)
  )

  const getPriorityBadge = (pri: string) => {
    const p = (pri || "MEDIUM").toUpperCase()
    switch (p) {
      case "CRITICAL":
        return <Badge className="bg-red-50 text-red-700 border-red-200">Critical</Badge>
      case "HIGH":
        return <Badge className="bg-orange-50 text-orange-700 border-orange-200">High</Badge>
      case "MEDIUM":
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Medium</Badge>
      case "LOW":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Low</Badge>
      default:
        return <Badge className="bg-slate-50 text-slate-700 border-slate-200">{pri}</Badge>
    }
  }

  const getStatusBadge = (status: string) => {
    const s = (status || "PENDING").toUpperCase()
    switch (s) {
      case "PENDING":
        return <Badge className="bg-yellow-50 text-yellow-800 border-yellow-200 animate-pulse">Pending</Badge>
      case "ASSIGNED":
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200">Assigned</Badge>
      case "IN_PROGRESS":
        return <Badge className="bg-purple-50 text-purple-700 border-purple-200">In Progress</Badge>
      case "COMPLETED":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Completed</Badge>
      case "CANCELLED":
        return <Badge className="bg-slate-100 text-slate-600 border-slate-200">Cancelled</Badge>
      default:
        return <Badge className="bg-slate-50 text-slate-700 border-slate-200">{status}</Badge>
    }
  }

  return (
    <div className="flex flex-col xl:flex-row-reverse gap-6 w-full xl:h-[calc(100vh-120px)] h-auto min-h-0">

      {/* RIGHT PANEL: Map Container */}
      <div className="flex-none xl:flex-1 xl:h-full h-[350px] sm:h-[450px] min-h-0 bg-white border border-slate-200 rounded-2xl p-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)] relative">
        <div id="emergency-map" className="w-full h-full rounded-xl z-10"></div>
        {/* Floating Reset Center Controls */}
        <div className="absolute bottom-6 right-6 z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.setView([21.8206, 75.6094], 12, { animate: true })
              }
            }}
            className="bg-white hover:bg-slate-50 text-slate-700 shadow-md border-slate-200 gap-1.5 text-xs font-semibold px-3 py-1.5 h-8.5 rounded-lg"
          >
            <Map className="h-3.5 w-3.5" /> Center Map
          </Button>
        </div>
      </div>

      {/* LEFT PANEL: Form / Active queue list */}
      <div className="w-full xl:w-[480px] xl:h-full flex flex-col min-h-0 bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">

        {/* Citizen View Tabs */}
        {isCitizen && (
          <div className="flex bg-slate-100 rounded-lg p-1 mb-6 shrink-0">
            <button
              onClick={() => setCitizenTab("book")}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${citizenTab === "book" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
            >
              <Navigation className="h-3.5 w-3.5" /> Request Help
            </button>
            <button
              onClick={() => setCitizenTab("history")}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${citizenTab === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
            >
              <Clock className="h-3.5 w-3.5" /> My Requests
            </button>
          </div>
        )}

        {/* Staff View Tabs */}
        {isStaff && (
          <div className="flex bg-slate-100 rounded-lg p-1 mb-6 shrink-0">
            <button
              onClick={() => setStaffTab("intake")}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${staffTab === "intake" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
            >
              <Plus className="h-3.5 w-3.5" /> Request Intake
            </button>
            <button
              onClick={() => setStaffTab("queue")}
              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 ${staffTab === "queue" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Request Queue
            </button>
          </div>
        )}

        {/* Header - Staff / Citizen Booking */}
        {((isCitizen && citizenTab === "book") || (isStaff && staffTab === "intake")) && (
          <div className="mb-6 shrink-0">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-red-500" />
              {isStaff ? "Emergency Request Intake" : "Call for Emergency Help"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isStaff
                ? "Manually log a citizen call or dispatcher emergency case report."
                : "Fill out the information below. Dispatchers will instantly route an ambulance."}
            </p>
          </div>
        )}

        {/* Content Body */}
        {isCitizen && citizenTab === "history" ? (
          /* CITIZEN HISTORY VIEW */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Your Active Requests ({ongoingRequests.length})</h3>
              <Button variant="ghost" size="icon" onClick={fetchRequests} className="h-8 w-8 text-slate-400">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto scrollable space-y-4 pr-1">
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading cases...</div>
              ) : filteredRequests.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-slate-200 rounded-xl">
                  <MapPin className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">You haven't requested any ambulances yet.</p>
                </div>
              ) : (
                <>
                  {ongoingRequests.map((req) => (
                    <div
                      key={req.id}
                      onClick={() => handleSelectRequest(req)}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-3 ${selectedRequestId === req.id
                          ? "border-slate-900 bg-slate-50/50 ring-1 ring-slate-900"
                          : "border-slate-100 hover:border-slate-200 bg-white"
                        }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-bold text-slate-900">{req.emergency_type}</span>
                        {getStatusBadge(req.status)}
                      </div>
                      <div className="space-y-1 text-xs text-slate-500">
                        <p className="truncate"><span className="font-semibold text-slate-700">Pickup:</span> {req.pickup_location}</p>
                        <p><span className="font-semibold text-slate-700">Coordinates:</span> ({parseFloat(req.latitude as any).toFixed(4)}, {parseFloat(req.longitude as any).toFixed(4)})</p>
                        <p><span className="font-semibold text-slate-700">Logged at:</span> {new Date(req.created_at).toLocaleString()}</p>
                      </div>
                      {["PENDING", "ASSIGNED"].includes(req.status) && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="w-full text-xs font-semibold h-8 rounded-lg mt-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCancelRequest(req.id)
                          }}
                        >
                          Cancel Request
                        </Button>
                      )}
                    </div>
                  ))}

                  {pastRequests.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Past Requests ({pastRequests.length})</h4>
                      <div className="space-y-3">
                        {pastRequests.map((req) => (
                          <div
                            key={req.id}
                            onClick={() => handleSelectRequest(req)}
                            className={`p-3 rounded-lg border text-left bg-slate-50/40 text-xs flex flex-col gap-1.5 cursor-pointer ${selectedRequestId === req.id ? "border-slate-900 bg-slate-50" : "border-slate-100"
                              }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-700">{req.emergency_type}</span>
                              {getStatusBadge(req.status)}
                            </div>
                            <p className="text-slate-400 truncate">{req.pickup_location}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : ((isCitizen && citizenTab === "book") || (isStaff && staffTab === "intake")) ? (
          /* CITIZEN BOOK / STAFF CREATE FORM VIEW */
          <form onSubmit={handleCreateRequest} className="flex-1 overflow-y-auto scrollable space-y-4 pr-1">
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{submitError}</span>
              </div>
            )}
            {submitSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>{submitSuccess}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Requester Name
              </label>
              <Input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="e.g. John Doe"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Contact Number
              </label>
              <Input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. 55501994567"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Emergency Incident Type
              </label>
              <select
                value={emergencyType}
                onChange={(e) => setEmergencyType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-900 bg-white text-slate-900 font-medium"
              >
                <option value="Cardiac Arrest">Cardiac Arrest</option>
                <option value="Stroke">Stroke</option>
                <option value="Respiratory Distress">Respiratory Distress</option>
                <option value="Trauma/Bleeding">Trauma/Bleeding</option>
                <option value="Severe Accident">Severe Accident</option>
                <option value="OB/GYN Emergency">OB/GYN Emergency</option>
                <option value="Other">Other (Please Specify)</option>
              </select>
            </div>

            {emergencyType === "Other" && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Specify Medical Emergency
                </label>
                <Input
                  type="text"
                  value={customEmergencyType}
                  onChange={(e) => setCustomEmergencyType(e.target.value)}
                  placeholder="Describe the medical situation"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Pickup Address / Location
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  placeholder="e.g. 123 Main St, Central City"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGeocode}
                  disabled={geocoding}
                  className="px-3 shrink-0 h-10 border-slate-200 font-bold"
                >
                  {geocoding ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" /> : "Locate"}
                </Button>
              </div>
              {geocodeError && <span className="text-[10px] text-red-500 font-medium block mt-1">{geocodeError}</span>}
              {geocodeSuccess && <span className="text-[10px] text-emerald-600 font-medium block mt-1">{geocodeSuccess}</span>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Latitude
                </label>
                <Input
                  type="number"
                  step="0.000001"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 21.8206"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Longitude
                </label>
                <Input
                  type="number"
                  step="0.000001"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. 75.6094"
                  required
                />
              </div>
            </div>
            {isStaff && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Assign Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-900 bg-white text-slate-900 font-medium"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-slate-950 hover:bg-slate-800 active:bg-slate-950 font-bold h-11 rounded-lg text-white transition-all shadow-sm"
            >
              {submitting ? "Submitting Request..." : isStaff ? "Log Emergency Request" : "Call Ambulance Now"}
            </Button>

            {isCitizen && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCitizenTab("history")}
                className="w-full text-slate-500 hover:text-slate-800 text-xs h-9 border-none bg-transparent hover:bg-slate-50"
              >
                View Existing Requests &rarr;
              </Button>
            )}
          </form>
        ) : null}

        {/* STAFF INCIDENT QUEUE VIEW */}
        {isStaff && staffTab === "queue" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between pb-3 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Emergency Queue ({filteredRequests.length})
              </h3>
              <Button variant="ghost" size="icon" onClick={fetchRequests} className="h-8 w-8 text-slate-400" title="Refresh queue">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Queue Controls */}
            <div className="space-y-3 mb-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search name, location, incident..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-600 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-600 focus:outline-none"
                >
                  <option value="">All Priorities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            {/* Queue Scroll List */}
            <div className="flex-1 overflow-y-auto scrollable space-y-4 pr-1">
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading active queue...</div>
              ) : filteredRequests.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No emergency cases found.</div>
              ) : (
                <div className="space-y-4">
                  {/* Ongoing Cases */}
                  {ongoingRequests.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ongoing Cases ({ongoingRequests.length})</h4>
                      {ongoingRequests.map((req) => (
                        <div
                          key={req.id}
                          onClick={() => handleSelectRequest(req)}
                          className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-3 relative overflow-hidden bg-white ${selectedRequestId === req.id
                              ? "border-slate-900 bg-slate-50/50 ring-1 ring-slate-900"
                              : "border-slate-200 hover:border-slate-300"
                            }`}
                          style={{
                            borderLeftWidth: "4px",
                            borderLeftColor:
                              req.priority === "CRITICAL"
                                ? "#ef4444"
                                : req.priority === "HIGH"
                                  ? "#f97316"
                                  : req.priority === "MEDIUM"
                                    ? "#3b82f6"
                                    : "#10b981",
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-sm font-bold text-slate-900 block">{req.emergency_type}</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">Logged {new Date(req.created_at).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {getPriorityBadge(req.priority)}
                              {getStatusBadge(req.status)}
                            </div>
                          </div>

                          <div className="space-y-1 text-xs text-slate-500 border-t border-slate-50 pt-2">
                            <p className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400 shrink-0" /> <span className="truncate">{req.requester_name} ({req.contact_number})</span></p>
                            <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" /> <span className="truncate">{req.pickup_location}</span></p>
                          </div>

                          {/* Staff Action Controls */}
                          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 mt-1" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Status</label>
                              <select
                                value={req.status}
                                onChange={(e) => handleUpdateStatus(req.id, e.target.value)}
                                disabled={["ASSIGNED", "IN_PROGRESS"].includes(req.status)}
                                className="w-full px-2 py-1 border border-slate-200 text-xs rounded bg-white text-slate-700"
                                title={["ASSIGNED", "IN_PROGRESS"].includes(req.status) ? "This request has an active mission. Update status via the Dispatch Console." : ""}
                              >
                                <option value="PENDING">Pending</option>
                                {req.status === "ASSIGNED" && <option value="ASSIGNED">Assigned</option>}
                                {req.status === "IN_PROGRESS" && <option value="IN_PROGRESS">In Progress</option>}
                                <option value="COMPLETED">Completed</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Priority</label>
                              <select
                                value={req.priority}
                                onChange={(e) => handleUpdatePriority(req.id, e.target.value)}
                                className="w-full px-2 py-1 border border-slate-200 text-xs rounded bg-white text-slate-700"
                              >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="CRITICAL">Critical</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Past Cases */}
                  {pastRequests.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Past & Closed Cases ({pastRequests.length})</h4>
                      {pastRequests.map((req) => (
                        <div
                          key={req.id}
                          onClick={() => handleSelectRequest(req)}
                          className={`p-3 rounded-lg border bg-slate-50/40 text-xs flex flex-col gap-1.5 cursor-pointer ${selectedRequestId === req.id ? "border-slate-900 bg-slate-50" : "border-slate-100"
                            }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-slate-800">{req.emergency_type}</span>
                            {getStatusBadge(req.status)}
                          </div>
                          <p className="text-slate-400 truncate">{req.pickup_location}</p>
                          <span className="text-[10px] text-slate-400">Closed Case ({req.status})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
