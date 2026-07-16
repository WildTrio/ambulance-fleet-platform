import React, { useState, useEffect } from "react"
import {
  Truck,
  Plus,
  X,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronDown,
  User,
  Building2,
  MapPin,
  Wrench,
  ArrowRightLeft,
  Clock,
  Shield,
  History,
  Activity,
  CircleDot,
} from "lucide-react"
import api from "../services/api"
// @ts-expect-error - AuthContext is currently .jsx
import { useAuth } from "../context/AuthContext"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
// ── Types ────────────────────────────────────────────────────────────────
interface Hospital {
  id: string
  hospital_name: string
}
interface Station {
  id: string
  station_name: string
  hospital: string
  hospital_detail?: { hospital_name: string }
}
interface Driver {
  id: string
  name: string
  license_number: string
}
interface ActiveMission {
  id: string
  status: string
}
interface Ambulance {
  id: string
  ambulance_number: string
  type: string
  status: string
  hospital?: Hospital
  station?: Station
  active_driver?: Driver
  active_mission?: ActiveMission | null
  equipment: string[]
  current_latitude?: string
  current_longitude?: string
}
interface Equipment {
  id: string
  name: string
}
interface HistoryLog {
  id: string
  event_type: string
  old_value: string | null
  new_value: string | null
  remarks: string | null
  changed_at: string
  changed_by: string
}
interface FormData {
  ambulance_number: string
  hospital_id: string
  station_id: string
  type: string
  status: string
  equipment: string[]
}
interface StatusChangeData {
  status: string
  remarks: string
}
type ModalType = "add" | "edit" | "assign" | "transfer" | "status" | "history" | null
// ── Component ────────────────────────────────────────────────────────────
const Ambulances: React.FC = () => {
  const { user } = useAuth()
  const userRole = typeof user?.role === "object" ? user.role?.name : user?.role
  const isWritable = ["HOSPITAL_ADMINISTRATOR", "FLEET_MANAGER"].includes(userRole)
  const [ambulances, setAmbulances] = useState<Ambulance[]>([])
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [stationFilter, setStationFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [selectedAmbulance, setSelectedAmbulance] = useState<Ambulance | null>(null)
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [newEquipmentName, setNewEquipmentName] = useState("")
  const [formData, setFormData] = useState<FormData>({
    ambulance_number: "",
    hospital_id: "",
    station_id: "",
    type: "Basic Life Support",
    status: "ACTIVE",
    equipment: [],
  })
  const [assignDriverId, setAssignDriverId] = useState("")
  const [transferStationId, setTransferStationId] = useState("")
  const [statusChange, setStatusChange] = useState<StatusChangeData>({
    status: "ACTIVE",
    remarks: "",
  })
  // Auto-dismiss alerts
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 4000)
      return () => clearTimeout(t)
    }
  }, [actionSuccess])
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 6000)
      return () => clearTimeout(t)
    }
  }, [error])
  // ── API Calls ──────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      if (typeFilter) params.type = typeFilter
      if (stationFilter) params.station_id = stationFilter
      const [ambRes, hospRes, statRes, equipRes] = await Promise.all([
        api.get("/ambulances/", { params }),
        api.get("/hospitals/"),
        api.get("/stations/"),
        api.get("/equipment/"),
      ])
      setAmbulances(ambRes.data)
      setHospitals(hospRes.data)
      setStations(statRes.data)
      setEquipmentList(equipRes.data)
      if (isWritable) {
        const driversRes = await api.get("/drivers/?available=true")
        setDrivers(driversRes.data)
      }
    } catch (err: any) {
      setError(err.detail || "Failed to fetch fleet data.")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    fetchData()
  }, [statusFilter, typeFilter, stationFilter])
  const loadDrivers = async () => {
    try {
      const driversRes = await api.get("/drivers/?available=true")
      setDrivers(driversRes.data)
    } catch (err) {
      console.error("Failed to load drivers", err)
    }
  }
  // ── Modal Handlers ─────────────────────────────────────────────────
  const handleOpenModal = (modalType: ModalType, ambulance: Ambulance | null = null) => {
    setSelectedAmbulance(ambulance)
    setActiveModal(modalType)
    setActionSuccess(null)
    setError(null)
    if (ambulance) {
      if (modalType === "edit") {
        setFormData({
          ambulance_number: ambulance.ambulance_number,
          hospital_id: ambulance.hospital?.id || "",
          station_id: ambulance.station?.id || "",
          type: ambulance.type,
          status: ambulance.status,
          equipment: ambulance.equipment || [],
        })
      } else if (modalType === "assign") {
        setAssignDriverId(ambulance.active_driver?.id || "")
        loadDrivers()
      } else if (modalType === "transfer") {
        setTransferStationId(ambulance.station?.id || "")
      } else if (modalType === "status") {
        setStatusChange({ status: ambulance.status, remarks: "" })
      } else if (modalType === "history") {
        fetchHistory(ambulance.id)
      }
    } else {
      setFormData({
        ambulance_number: "",
        hospital_id: hospitals[0]?.id || "",
        station_id: "",
        type: "Basic Life Support",
        status: "ACTIVE",
        equipment: [],
      })
    }
  }
  const handleCloseModal = () => {
    setActiveModal(null)
    setSelectedAmbulance(null)
  }
  const fetchHistory = async (id: string) => {
    setHistoryLoading(true)
    try {
      const historyRes = await api.get(`/ambulances/${id}/history/`)
      setHistoryLogs(historyRes.data)
    } catch {
      setError("Failed to fetch operational history.")
    } finally {
      setHistoryLoading(false)
    }
  }
  // ── Form Submissions ───────────────────────────────────────────────
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.post("/ambulances/", formData)
      setActionSuccess("Ambulance added successfully!")
      fetchData()
      handleCloseModal()
    } catch (err: any) {
      if (err.ambulance_number) setError(`Ambulance Number: ${err.ambulance_number[0]}`)
      else if (err.non_field_errors) setError(err.non_field_errors[0])
      else setError("Failed to add ambulance.")
    }
  }
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.patch(`/ambulances/${selectedAmbulance!.id}/`, formData)
      setActionSuccess("Ambulance details updated!")
      fetchData()
      handleCloseModal()
    } catch (err: any) {
      if (err.ambulance_number) setError(`Ambulance Number: ${err.ambulance_number[0]}`)
      else if (err.non_field_errors) setError(err.non_field_errors[0])
      else setError("Failed to update ambulance.")
    }
  }
  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this ambulance?")) return
    setError(null)
    try {
      await api.delete(`/ambulances/${id}/`)
      setActionSuccess("Ambulance deleted successfully!")
      fetchData()
    } catch {
      setError("Failed to delete ambulance.")
    }
  }
  const handleAssignDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const payload = { driver_id: assignDriverId || null }
      await api.post(`/ambulances/${selectedAmbulance!.id}/assign-driver/`, payload)
      setActionSuccess("Driver assignment updated!")
      fetchData()
      handleCloseModal()
    } catch (err: any) {
      setError(err.non_field_errors?.[0] || err.detail || "Failed to assign driver.")
    }
  }
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.post(`/ambulances/${selectedAmbulance!.id}/transfer/`, { station_id: transferStationId })
      setActionSuccess("Ambulance transferred successfully!")
      fetchData()
      handleCloseModal()
    } catch (err: any) {
      setError(err.non_field_errors?.[0] || "Failed to transfer station.")
    }
  }
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.post(`/ambulances/${selectedAmbulance!.id}/change-status/`, statusChange)
      setActionSuccess("Ambulance status updated!")
      fetchData()
      handleCloseModal()
    } catch (err: any) {
      setError(err.non_field_errors?.[0] || err.detail || "Failed to change status.")
    }
  }
  const handleToggleEquipment = (eqName: string) => {
    const isSelected = formData.equipment.includes(eqName)
    setFormData({
      ...formData,
      equipment: isSelected
        ? formData.equipment.filter((name) => name !== eqName)
        : [...formData.equipment, eqName],
    })
  }
  const handleAddCustomEquipment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEquipmentName?.trim()) return
    const cleanedName = newEquipmentName.trim()
    if (!formData.equipment.includes(cleanedName)) {
      setFormData({ ...formData, equipment: [...formData.equipment, cleanedName] })
    }
    if (!equipmentList.some((eq) => eq.name.toLowerCase() === cleanedName.toLowerCase())) {
      setEquipmentList([...equipmentList, { id: cleanedName, name: cleanedName }])
    }
    setNewEquipmentName("")
  }
  // ── Computed Values ────────────────────────────────────────────────
  const totalAmbulances = ambulances.length
  const activeCount = ambulances.filter((a) => a.status === "ACTIVE").length
  const maintenanceCount = ambulances.filter((a) => a.status === "MAINTENANCE").length
  const inactiveCount = ambulances.filter((a) => a.status === "INACTIVE").length
  const filteredAmbulances = ambulances.filter((a) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      a.ambulance_number.toLowerCase().includes(q) ||
      (a.hospital?.hospital_name || "").toLowerCase().includes(q) ||
      (a.station?.station_name || "").toLowerCase().includes(q) ||
      (a.active_driver?.name || "").toLowerCase().includes(q)
    )
  })
  const statusBadge = (status: string, activeMission?: ActiveMission | null) => {
    if (activeMission) {
      return (
        <Badge className="text-[9px] font-bold px-2 py-0.5 border bg-blue-50 text-blue-700 border-blue-200 animate-pulse">
          On Mission ({activeMission.status.replace("_", " ")})
        </Badge>
      )
    }
    const styles: Record<string, string> = {
      ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
      MAINTENANCE: "bg-orange-50 text-orange-700 border-orange-200",
      INACTIVE: "bg-slate-50 text-slate-500 border-slate-200",
    }
    return (
      <Badge className={`text-[9px] font-bold px-2 py-0.5 border ${styles[status] || styles.INACTIVE}`}>
        {status}
      </Badge>
    )
  }
  // ── Select Component ───────────────────────────────────────────────
  const SelectWrapper: React.FC<{
    value: string
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
    children: React.ReactNode
    className?: string
    required?: boolean
  }> = ({ value, onChange, children, className = "", required }) => (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        required={required}
        className={`w-full h-9 pl-3 pr-8 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1 ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
    </div>
  )
  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn p-1">
      {/* ── KPI Metrics Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-3">
          <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
            <Truck className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Fleet</span>
            <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{totalAmbulances}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-3 border-l-4 border-l-emerald-500">
          <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active</span>
            <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{activeCount}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-3 border-l-4 border-l-orange-500">
          <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl">
            <Wrench className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Maintenance</span>
            <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{maintenanceCount}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-3 border-l-4 border-l-slate-400">
          <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
            <CircleDot className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Inactive</span>
            <h3 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">{inactiveCount}</h3>
          </div>
        </div>
      </div>
      {/* ── Toast Alerts ────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium animate-fadeIn">
          <AlertTriangle className="h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> <span>{actionSuccess}</span>
        </div>
      )}
      {/* ── Controls Bar ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:flex-none lg:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input type="text" placeholder="Search fleet..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-xs rounded-lg border-slate-200" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 pl-3 pr-8 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg appearance-none cursor-pointer hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1">
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 pl-3 pr-8 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg appearance-none cursor-pointer hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1">
              <option value="">All Types</option>
              <option value="Basic Life Support">Basic Life Support</option>
              <option value="Advanced Life Support">Advanced Life Support</option>
              <option value="Patient Transport">Patient Transport</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} className="h-9 pl-3 pr-8 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg appearance-none cursor-pointer hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1">
              <option value="">All Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.station_name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
        </div>
        {isWritable && (
          <Button onClick={() => handleOpenModal("add")} className="bg-slate-950 hover:bg-slate-800 text-white font-bold h-9 px-4 rounded-lg shadow-sm text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Ambulance
          </Button>
        )}
      </div>
      {/* ── Fleet Cards Grid ────────────────────────────────────── */}
      {loading ? (
        <div className="py-28 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2.5">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
          <span className="font-semibold text-slate-500">Loading ambulance fleet assets...</span>
        </div>
      ) : filteredAmbulances.length === 0 ? (
        <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3 bg-white border border-dashed border-slate-200 rounded-2xl p-8">
          <Truck className="h-10 w-10 text-slate-300" />
          <span className="font-semibold text-slate-500">No ambulances match your filter criteria.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAmbulances.map((amb) => (
            <div key={amb.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col gap-4 transition-all hover:shadow-md">
              {/* Card Header */}
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-xs ${
                    amb.active_mission ? "bg-blue-600" : amb.status === "ACTIVE" ? "bg-slate-900" : amb.status === "MAINTENANCE" ? "bg-orange-500" : "bg-slate-400"
                  }`}>
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">{amb.ambulance_number}</h4>
                    <span className="text-[10px] font-medium text-slate-400">{amb.type}</span>
                  </div>
                </div>
                {statusBadge(amb.status, amb.active_mission)}
              </div>
              {/* Card Details */}
              <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{amb.hospital?.hospital_name || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{amb.station?.station_name || "Unassigned"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className={amb.active_driver ? "font-semibold text-slate-700" : ""}>
                    {amb.active_driver?.name || "No Driver"}
                  </span>
                </div>
                {amb.equipment && amb.equipment.length > 0 && (
                  <div className="flex items-start gap-2 text-slate-500">
                    <Wrench className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {amb.equipment.map((eq) => (
                        <span key={eq} className="text-[9px] font-bold bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Card Actions */}
              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 mt-auto">
                <button onClick={() => handleOpenModal("history", amb)} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors">
                  <History className="h-3 w-3" /> History
                </button>
                {isWritable && (
                  <>
                    <button onClick={() => handleOpenModal("assign", amb)} disabled={!!amb.active_mission} title={amb.active_mission ? "Cannot change while on mission" : ""} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <User className="h-3 w-3" /> Assign
                    </button>
                    <button onClick={() => handleOpenModal("transfer", amb)} disabled={!!amb.active_mission} title={amb.active_mission ? "Cannot transfer while on mission" : ""} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <ArrowRightLeft className="h-3 w-3" /> Transfer
                    </button>
                    <button onClick={() => handleOpenModal("status", amb)} disabled={!!amb.active_mission} title={amb.active_mission ? "Cannot change status while on mission" : ""} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Shield className="h-3 w-3" /> Status
                    </button>
                    <button onClick={() => handleOpenModal("edit", amb)} disabled={!!amb.active_mission} title={amb.active_mission ? "Cannot edit while on mission" : ""} className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button onClick={() => handleDelete(amb.id)} disabled={!!amb.active_mission} title={amb.active_mission ? "Cannot delete while on mission" : ""} className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 hover:bg-red-100 transition-colors ml-auto disabled:opacity-40 disabled:cursor-not-allowed">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── MODALS ─────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={handleCloseModal}>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-sm font-bold text-slate-900">
                {activeModal === "add" && "Register New Ambulance"}
                {activeModal === "edit" && `Edit — ${selectedAmbulance?.ambulance_number}`}
                {activeModal === "assign" && `Assign Driver — ${selectedAmbulance?.ambulance_number}`}
                {activeModal === "transfer" && `Transfer Station — ${selectedAmbulance?.ambulance_number}`}
                {activeModal === "status" && `Change Status — ${selectedAmbulance?.ambulance_number}`}
                {activeModal === "history" && `History — ${selectedAmbulance?.ambulance_number}`}
              </h2>
              <button onClick={handleCloseModal} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto scrollable p-6">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium mb-4">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
                </div>
              )}
              {/* ── Add & Edit Form ───────────────────────── */}
              {(activeModal === "add" || activeModal === "edit") && (
                <form onSubmit={activeModal === "add" ? handleAddSubmit : handleEditSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ambulance Number</label>
                    <Input type="text" value={formData.ambulance_number} onChange={(e) => setFormData({ ...formData, ambulance_number: e.target.value })} placeholder="e.g. AMB-001" required className="h-9 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hospital</label>
                      <SelectWrapper value={formData.hospital_id} onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })} required>
                        <option value="">Select Hospital</option>
                        {hospitals.map((h) => (<option key={h.id} value={h.id}>{h.hospital_name}</option>))}
                      </SelectWrapper>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Station</label>
                      <SelectWrapper value={formData.station_id} onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}>
                        <option value="">None (Unassigned)</option>
                        {stations.filter((s) => !formData.hospital_id || s.hospital === formData.hospital_id).map((s) => (
                          <option key={s.id} value={s.id}>{s.station_name}</option>
                        ))}
                      </SelectWrapper>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Type</label>
                    <SelectWrapper value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} required>
                      <option value="Basic Life Support">Basic Life Support</option>
                      <option value="Advanced Life Support">Advanced Life Support</option>
                      <option value="Patient Transport">Patient Transport</option>
                    </SelectWrapper>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Medical Equipment</label>
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto scrollable pr-1">
                      {equipmentList.map((eq) => (
                        <label key={eq.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer hover:text-slate-900 transition-colors">
                          <input type="checkbox" checked={formData.equipment.includes(eq.name)} onChange={() => handleToggleEquipment(eq.name)} className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
                          {eq.name}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="text" placeholder="Add custom equipment..." value={newEquipmentName} onChange={(e) => setNewEquipmentName(e.target.value)} className="h-8 text-xs flex-1" />
                      <Button type="button" variant="outline" onClick={handleAddCustomEquipment} className="h-8 px-3 text-[10px] font-bold rounded-lg">Add</Button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={handleCloseModal} className="h-9 px-4 rounded-lg text-xs font-bold">Cancel</Button>
                    <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-9 px-5 rounded-lg text-xs font-bold shadow-sm">
                      {activeModal === "add" ? "Add Ambulance" : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}
              {/* ── Assign Driver ─────────────────────────── */}
              {activeModal === "assign" && (
                <form onSubmit={handleAssignDriverSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Choose Driver</label>
                    <SelectWrapper value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
                      <option value="">— No Driver (Unassign Current) —</option>
                      {selectedAmbulance?.active_driver && (
                        <option value={selectedAmbulance.active_driver.id}>
                          {selectedAmbulance.active_driver.name} (Current)
                        </option>
                      )}
                      {drivers.map((d) => (<option key={d.id} value={d.id}>{d.name} ({d.license_number})</option>))}
                    </SelectWrapper>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={handleCloseModal} className="h-9 px-4 rounded-lg text-xs font-bold">Cancel</Button>
                    <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-9 px-5 rounded-lg text-xs font-bold shadow-sm">Assign Driver</Button>
                  </div>
                </form>
              )}
              {/* ── Transfer Station ──────────────────────── */}
              {activeModal === "transfer" && (
                <form onSubmit={handleTransferSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Destination Station</label>
                    <SelectWrapper value={transferStationId} onChange={(e) => setTransferStationId(e.target.value)} required>
                      <option value="">Select Station</option>
                      {stations.map((s) => (<option key={s.id} value={s.id}>{s.station_name}</option>))}
                    </SelectWrapper>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={handleCloseModal} className="h-9 px-4 rounded-lg text-xs font-bold">Cancel</Button>
                    <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-9 px-5 rounded-lg text-xs font-bold shadow-sm">Transfer Station</Button>
                  </div>
                </form>
              )}
              {/* ── Change Status ─────────────────────────── */}
              {activeModal === "status" && (
                <form onSubmit={handleStatusSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</label>
                    <SelectWrapper value={statusChange.status} onChange={(e) => setStatusChange({ ...statusChange, status: e.target.value })} required>
                      <option value="ACTIVE">Active</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="INACTIVE">Inactive</option>
                    </SelectWrapper>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remarks / Reason</label>
                    <textarea
                      value={statusChange.remarks}
                      onChange={(e) => setStatusChange({ ...statusChange, remarks: e.target.value })}
                      placeholder="Provide reasoning for this status transition..."
                      rows={3}
                      className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={handleCloseModal} className="h-9 px-4 rounded-lg text-xs font-bold">Cancel</Button>
                    <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-9 px-5 rounded-lg text-xs font-bold shadow-sm">Change Status</Button>
                  </div>
                </form>
              )}
              {/* ── History Timeline ──────────────────────── */}
              {activeModal === "history" && (
                <div className="space-y-4">
                  {historyLoading ? (
                    <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                      <span>Loading logs...</span>
                    </div>
                  ) : historyLogs.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                      <History className="h-8 w-8 text-slate-300" />
                      <span>No history recorded for this ambulance yet.</span>
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-4">
                      {/* Timeline vertical line */}
                      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />
                      {historyLogs.map((log) => (
                        <div key={log.id} className="relative">
                          <div className="absolute left-[-15px] top-1.5 h-3 w-3 rounded-full border-2 border-slate-300 bg-white" />
                          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl text-xs space-y-1.5">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider">
                                {log.event_type.replace("_", " ")}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium">{new Date(log.changed_at).toLocaleString()}</span>
                            </div>
                            <p className="text-slate-600">
                              {log.old_value && (
                                <><span className="line-through text-slate-400">{log.old_value}</span> → </>
                              )}
                              <span className="font-semibold text-slate-800">{log.new_value || "None"}</span>
                            </p>
                            {log.remarks && <p className="text-slate-400 italic">"{log.remarks}"</p>}
                            <span className="text-[9px] text-slate-400">By: {log.changed_by}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default Ambulances
