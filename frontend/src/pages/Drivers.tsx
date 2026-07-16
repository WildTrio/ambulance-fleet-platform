import React, { useState, useEffect } from "react"
import {
  Users,
  UserPlus,
  Shield,
  Phone,
  Mail,
  CreditCard,
  CalendarDays,
  Award,
  Clock,
  Pencil,
  Trash2,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronDown
} from "lucide-react"
import api from "../services/api"
// @ts-expect-error - AuthContext is currently .jsx
import { useAuth } from "../context/AuthContext"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"

// ── Types ────────────────────────────────────────────────────────────────

interface Driver {
  id: string
  name: string
  email: string
  contact: string
  license_number: string
  availability: boolean
}

interface Shift {
  id: string
  driver: string
  start_time: string
  end_time: string
}

interface Certification {
  id: string
  driver: string
  name: string
  certificate_number: string
  issuing_authority: string
  issue_date: string
  expiry_date: string
}

interface DriverFormState {
  name: string
  email: string
  password: string
  contact: string
  license_number: string
  availability: boolean
}

interface ShiftFormState {
  id: string | null
  start_time: string
  end_time: string
}

interface CertFormState {
  id: string | null
  name: string
  certificate_number: string
  issuing_authority: string
  issue_date: string
  expiry_date: string
}

type ModalType = "add" | "edit" | "shifts" | "certifications" | null

// ── Component ────────────────────────────────────────────────────────────

const Drivers: React.FC = () => {
  const { user } = useAuth()
  const userRole = typeof user?.role === "object" ? user.role?.name : user?.role
  const isWritable = ["HOSPITAL_ADMINISTRATOR", "FLEET_MANAGER"].includes(userRole)

  const [drivers, setDrivers] = useState<Driver[]>([])
  const [availabilityFilter, setAvailabilityFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  // Loading & error states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Modals visibility states
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)

  // Shifts and Certifications states
  const [shifts, setShifts] = useState<Shift[]>([])
  const [certifications, setCertifications] = useState<Certification[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // Form states
  const [driverForm, setDriverForm] = useState<DriverFormState>({
    name: "",
    email: "",
    password: "",
    contact: "",
    license_number: "",
    availability: true,
  })

  const [shiftForm, setShiftForm] = useState<ShiftFormState>({
    id: null,
    start_time: "",
    end_time: "",
  })

  const [certForm, setCertForm] = useState<CertFormState>({
    id: null,
    name: "",
    certificate_number: "",
    issuing_authority: "",
    issue_date: "",
    expiry_date: "",
  })

  const [showShiftAdd, setShowShiftAdd] = useState(false)
  const [showCertAdd, setShowCertAdd] = useState(false)

  // Auto-dismiss success messages
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [actionSuccess])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // ── API Calls ──────────────────────────────────────────────────────

  const fetchDrivers = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (availabilityFilter) params.available = availabilityFilter
      const response = await api.get("/drivers/", { params })
      setDrivers(response.data)
    } catch (err: any) {
      setError(err.detail || "Failed to fetch driver data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDrivers()
  }, [availabilityFilter])

  // ── Modal Handlers ─────────────────────────────────────────────────

  const handleOpenModal = (modalType: ModalType, driver: Driver | null = null) => {
    setSelectedDriver(driver)
    setActiveModal(modalType)
    setActionSuccess(null)
    setError(null)
    setShowShiftAdd(false)
    setShowCertAdd(false)

    if (driver) {
      if (modalType === "edit") {
        setDriverForm({
          name: driver.name,
          email: driver.email,
          password: "",
          contact: driver.contact,
          license_number: driver.license_number,
          availability: driver.availability,
        })
      } else if (modalType === "shifts") {
        fetchShifts(driver.id)
        resetShiftForm()
      } else if (modalType === "certifications") {
        fetchCertifications(driver.id)
        resetCertForm()
      }
    } else {
      setDriverForm({
        name: "",
        email: "",
        password: "",
        contact: "",
        license_number: "",
        availability: true,
      })
    }
  }

  const handleCloseModal = () => {
    setActiveModal(null)
    setSelectedDriver(null)
  }

  // ── Shifts ─────────────────────────────────────────────────────────

  const fetchShifts = async (driverId: string) => {
    setDetailLoading(true)
    try {
      const res = await api.get(`/shifts/?driver_id=${driverId}`)
      setShifts(res.data)
    } catch {
      setError("Failed to fetch shifts.")
    } finally {
      setDetailLoading(false)
    }
  }

  const resetShiftForm = () => {
    setShiftForm({ id: null, start_time: "", end_time: "" })
    setShowShiftAdd(false)
  }

  const handleShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const payload = {
        driver: selectedDriver!.id,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
      }
      if (shiftForm.id) {
        await api.patch(`/shifts/${shiftForm.id}/`, payload)
        setActionSuccess("Shift updated successfully!")
      } else {
        await api.post("/shifts/", payload)
        setActionSuccess("Shift scheduled successfully!")
      }
      fetchShifts(selectedDriver!.id)
      resetShiftForm()
    } catch (err: any) {
      setError(err.non_field_errors?.[0] || "Validation error on shift details.")
    }
  }

  const handleEditShiftClick = (shift: Shift) => {
    const formatDt = (dtStr: string) => {
      if (!dtStr) return ""
      const d = new Date(dtStr)
      const pad = (n: number) => String(n).padStart(2, "0")
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setShiftForm({
      id: shift.id,
      start_time: formatDt(shift.start_time),
      end_time: formatDt(shift.end_time),
    })
    setShowShiftAdd(true)
  }

  const handleDeleteShift = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this shift?")) return
    setError(null)
    try {
      await api.delete(`/shifts/${id}/`)
      setActionSuccess("Shift cancelled.")
      fetchShifts(selectedDriver!.id)
    } catch {
      setError("Failed to delete shift.")
    }
  }

  // ── Certifications ─────────────────────────────────────────────────

  const fetchCertifications = async (driverId: string) => {
    setDetailLoading(true)
    try {
      const res = await api.get(`/certifications/?driver_id=${driverId}`)
      setCertifications(res.data)
    } catch {
      setError("Failed to fetch certifications.")
    } finally {
      setDetailLoading(false)
    }
  }

  const resetCertForm = () => {
    setCertForm({
      id: null,
      name: "",
      certificate_number: "",
      issuing_authority: "",
      issue_date: "",
      expiry_date: "",
    })
    setShowCertAdd(false)
  }

  const handleCertSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const payload = {
        driver: selectedDriver!.id,
        name: certForm.name,
        certificate_number: certForm.certificate_number,
        issuing_authority: certForm.issuing_authority,
        issue_date: certForm.issue_date,
        expiry_date: certForm.expiry_date,
      }
      if (certForm.id) {
        await api.patch(`/certifications/${certForm.id}/`, payload)
        setActionSuccess("Certification updated successfully!")
      } else {
        await api.post("/certifications/", payload)
        setActionSuccess("Certification added successfully!")
      }
      fetchCertifications(selectedDriver!.id)
      resetCertForm()
    } catch (err: any) {
      setError(err.non_field_errors?.[0] || "Validation error on certification details.")
    }
  }

  const handleEditCertClick = (cert: Certification) => {
    setCertForm({
      id: cert.id,
      name: cert.name,
      certificate_number: cert.certificate_number,
      issuing_authority: cert.issuing_authority,
      issue_date: cert.issue_date,
      expiry_date: cert.expiry_date,
    })
    setShowCertAdd(true)
  }

  const handleDeleteCert = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this certification?")) return
    setError(null)
    try {
      await api.delete(`/certifications/${id}/`)
      setActionSuccess("Certification removed.")
      fetchCertifications(selectedDriver!.id)
    } catch {
      setError("Failed to delete certification.")
    }
  }

  // ── Driver Submit ──────────────────────────────────────────────────

  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (activeModal === "add") {
        await api.post("/drivers/", driverForm)
        setActionSuccess("Driver profile created successfully!")
      } else {
        const payload: any = { ...driverForm }
        if (!payload.password) delete payload.password
        await api.patch(`/drivers/${selectedDriver!.id}/`, payload)
        setActionSuccess("Driver details updated!")
      }
      fetchDrivers()
      handleCloseModal()
    } catch (err: any) {
      if (err.email) setError(`Email: ${err.email[0]}`)
      else if (err.license_number) setError(`License: ${err.license_number[0]}`)
      else if (err.contact) setError(`Contact: ${err.contact[0]}`)
      else if (err.non_field_errors) setError(err.non_field_errors[0])
      else setError("Failed to save driver profile.")
    }
  }

  const handleDeleteDriver = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this driver? This deletes their associated user account.")) return
    setError(null)
    try {
      await api.delete(`/drivers/${id}/`)
      setActionSuccess("Driver account deleted successfully!")
      fetchDrivers()
    } catch {
      setError("Failed to delete driver.")
    }
  }

  // ── Metrics & Search ──────────────────────────────────────────────

  const totalDrivers = drivers.length
  const availableCount = drivers.filter((d) => d.availability).length
  const unavailableCount = drivers.filter((d) => !d.availability).length

  const filteredDrivers = drivers.filter((d) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      d.name.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.license_number.toLowerCase().includes(q) ||
      d.contact.toLowerCase().includes(q)
    )
  })

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn p-1">
      {/* ── KPI Metrics Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <Users className="h-6 w-6 text-slate-700" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Drivers</span>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{totalDrivers}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Available / On Duty</span>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{availableCount}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center gap-4 border-l-4 border-l-red-500">
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Off Duty / Unavailable</span>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">{unavailableCount}</h3>
          </div>
        </div>
      </div>

      {/* ── Toast Alerts ────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium animate-fadeIn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ── Controls Bar ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs rounded-lg border-slate-200"
            />
          </div>
          <div className="relative">
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="h-9 pl-3 pr-8 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg appearance-none cursor-pointer hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
            >
              <option value="">All Drivers</option>
              <option value="true">Available Only</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {isWritable && (
          <Button
            onClick={() => handleOpenModal("add")}
            className="bg-slate-950 hover:bg-slate-800 text-white font-bold h-9 px-4 rounded-lg shadow-sm text-xs gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add Driver
          </Button>
        )}
      </div>

      {/* ── Driver Cards Grid ───────────────────────────────────── */}
      {loading ? (
        <div className="py-28 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2.5">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
          <span className="font-semibold text-slate-500">Loading driver profiles...</span>
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3 bg-white border border-dashed border-slate-200 rounded-2xl p-8">
          <Users className="h-10 w-10 text-slate-300" />
          <span className="font-semibold text-slate-500">No drivers registered matching criteria.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDrivers.map((drv) => (
            <div
              key={drv.id}
              className={`bg-white border rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col gap-4 transition-all hover:shadow-md ${
                drv.availability ? "border-slate-200" : "border-slate-200 opacity-80"
              }`}
            >
              {/* Card Header */}
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${
                    drv.availability ? "bg-slate-900" : "bg-slate-400"
                  }`}>
                    {drv.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">{drv.name}</h4>
                    <span className="text-[10px] font-medium text-slate-400">{drv.license_number}</span>
                  </div>
                </div>
                <Badge className={`text-[9px] font-bold px-2 py-0.5 border ${
                  drv.availability
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-50 text-slate-500 border-slate-200"
                }`}>
                  {drv.availability ? "Available" : "Unavailable"}
                </Badge>
              </div>

              {/* Card Details */}
              <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-slate-500">
                  <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{drv.email}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{drv.contact}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <CreditCard className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono text-[11px]">{drv.license_number}</span>
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 mt-auto">
                <button
                  onClick={() => handleOpenModal("shifts", drv)}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition-colors"
                >
                  <CalendarDays className="h-3 w-3" /> Shifts
                </button>
                <button
                  onClick={() => handleOpenModal("certifications", drv)}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition-colors"
                >
                  <Award className="h-3 w-3" /> Certifications
                </button>
                {isWritable && (
                  <>
                    <button
                      onClick={() => handleOpenModal("edit", drv)}
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition-colors"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDriver(drv.id)}
                      className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-100 transition-colors ml-auto"
                    >
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-sm font-bold text-slate-900">
                {activeModal === "add" && "Register New Driver Account"}
                {activeModal === "edit" && `Edit Driver — ${selectedDriver?.name}`}
                {activeModal === "shifts" && `Schedule — ${selectedDriver?.name}`}
                {activeModal === "certifications" && `Certifications — ${selectedDriver?.name}`}
              </h2>
              <button
                onClick={handleCloseModal}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto scrollable p-6">
              {/* Inline alerts */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium mb-4">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium mb-4">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* ── Add & Edit Driver Form ──────────────────── */}
              {(activeModal === "add" || activeModal === "edit") && (
                <form onSubmit={handleDriverSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</label>
                    <Input type="text" value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} placeholder="e.g. John Doe" required className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                    <Input type="email" value={driverForm.email} onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })} placeholder="e.g. driver@hospital.org" required className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Password {activeModal === "edit" && <span className="text-slate-300 normal-case">(leave blank to keep)</span>}
                    </label>
                    <Input type="password" value={driverForm.password} onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })} placeholder="Enter account password" required={activeModal === "add"} className="h-9 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contact</label>
                      <Input type="text" value={driverForm.contact} onChange={(e) => setDriverForm({ ...driverForm, contact: e.target.value })} placeholder="e.g. 555-0100" required className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">License Number</label>
                      <Input type="text" value={driverForm.license_number} onChange={(e) => setDriverForm({ ...driverForm, license_number: e.target.value })} placeholder="e.g. DL-12345678" required className="h-9 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Availability Status</label>
                    <div className="relative">
                      <select
                        value={driverForm.availability ? "true" : "false"}
                        onChange={(e) => setDriverForm({ ...driverForm, availability: e.target.value === "true" })}
                        className="w-full h-9 pl-3 pr-8 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
                      >
                        <option value="true">Available for Dispatch</option>
                        <option value="false">Off Duty / Unavailable</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <Button type="button" variant="outline" onClick={handleCloseModal} className="h-9 px-4 rounded-lg text-xs font-bold">
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-9 px-5 rounded-lg text-xs font-bold shadow-sm">
                      {activeModal === "add" ? "Create Account" : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}

              {/* ── Shifts Modal ────────────────────────────── */}
              {activeModal === "shifts" && (
                <div className="space-y-5">
                  {isWritable && (
                    <Button
                      onClick={() => {
                        if (showShiftAdd) resetShiftForm()
                        else setShowShiftAdd(true)
                      }}
                      className={`text-xs font-bold h-9 px-4 rounded-lg shadow-sm gap-1.5 ${
                        showShiftAdd
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                          : "bg-slate-950 hover:bg-slate-800 text-white"
                      }`}
                    >
                      {showShiftAdd ? (
                        <><X className="h-3 w-3" /> Close Scheduler</>
                      ) : (
                        <><Plus className="h-3 w-3" /> Schedule New Shift</>
                      )}
                    </Button>
                  )}

                  {showShiftAdd && isWritable && (
                    <form onSubmit={handleShiftSubmit} className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                      <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                        {shiftForm.id ? "Edit Scheduled Shift" : "New Shift"}
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Start</label>
                          <input type="datetime-local" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} required
                            className="w-full h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">End</label>
                          <input type="datetime-local" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} required
                            className="w-full h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={resetShiftForm} className="h-8 px-3 rounded-lg text-[10px] font-bold">Cancel</Button>
                        <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-8 px-4 rounded-lg text-[10px] font-bold shadow-sm">Save Shift</Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Shift History & Scheduled Blocks</h4>
                    {detailLoading ? (
                      <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                        <span>Loading shift calendar...</span>
                      </div>
                    ) : shifts.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <CalendarDays className="h-8 w-8 text-slate-300" />
                        <span>No shifts scheduled for this driver.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {shifts.map((s) => (
                          <div key={s.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl text-xs">
                            <div className="flex items-center gap-4 text-slate-600">
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-slate-400" />
                                <span className="font-semibold text-slate-800">{new Date(s.start_time).toLocaleString()}</span>
                              </div>
                              <span className="text-slate-300">→</span>
                              <span className="font-semibold text-slate-800">{new Date(s.end_time).toLocaleString()}</span>
                            </div>
                            {isWritable && (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => handleEditShiftClick(s)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleDeleteShift(s.id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Certifications Modal ────────────────────── */}
              {activeModal === "certifications" && (
                <div className="space-y-5">
                  {isWritable && (
                    <Button
                      onClick={() => {
                        if (showCertAdd) resetCertForm()
                        else setShowCertAdd(true)
                      }}
                      className={`text-xs font-bold h-9 px-4 rounded-lg shadow-sm gap-1.5 ${
                        showCertAdd
                          ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
                          : "bg-slate-950 hover:bg-slate-800 text-white"
                      }`}
                    >
                      {showCertAdd ? (
                        <><X className="h-3 w-3" /> Close Form</>
                      ) : (
                        <><Plus className="h-3 w-3" /> Add Certification</>
                      )}
                    </Button>
                  )}

                  {showCertAdd && isWritable && (
                    <form onSubmit={handleCertSubmit} className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
                      <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                        {certForm.id ? "Edit Certificate" : "Log New Certificate"}
                      </h4>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Certification Name</label>
                        <Input type="text" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="e.g. ALS / BLS / CPR" required className="h-9 text-xs" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Certificate #</label>
                          <Input type="text" value={certForm.certificate_number} onChange={(e) => setCertForm({ ...certForm, certificate_number: e.target.value })} placeholder="e.g. CERT-9923" required className="h-9 text-xs" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Issuing Authority</label>
                          <Input type="text" value={certForm.issuing_authority} onChange={(e) => setCertForm({ ...certForm, issuing_authority: e.target.value })} placeholder="e.g. Red Cross" required className="h-9 text-xs" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Issue Date</label>
                          <input type="date" value={certForm.issue_date} onChange={(e) => setCertForm({ ...certForm, issue_date: e.target.value })} required
                            className="w-full h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Expiry Date</label>
                          <input type="date" value={certForm.expiry_date} onChange={(e) => setCertForm({ ...certForm, expiry_date: e.target.value })} required
                            className="w-full h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={resetCertForm} className="h-8 px-3 rounded-lg text-[10px] font-bold">Cancel</Button>
                        <Button type="submit" className="bg-slate-950 hover:bg-slate-800 text-white h-8 px-4 rounded-lg text-[10px] font-bold shadow-sm">Save Certificate</Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Registered Certifications</h4>
                    {detailLoading ? (
                      <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                        <span>Loading credentials database...</span>
                      </div>
                    ) : certifications.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                        <Award className="h-8 w-8 text-slate-300" />
                        <span>No certifications registered.</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {certifications.map((c) => {
                          const isExpired = new Date(c.expiry_date) < new Date()
                          return (
                            <div key={c.id} className={`p-4 bg-white border rounded-xl text-xs transition-all ${
                              isExpired ? "border-red-200" : "border-slate-100"
                            }`}>
                              <div className="flex justify-between items-start mb-2.5">
                                <div className="flex items-center gap-2">
                                  <Award className={`h-4 w-4 ${isExpired ? "text-red-400" : "text-emerald-500"}`} />
                                  <span className="font-bold text-slate-900">{c.name}</span>
                                </div>
                                <Badge className={`text-[9px] font-bold px-1.5 py-0.5 border ${
                                  isExpired
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}>
                                  {isExpired ? "Expired" : "Valid"}
                                </Badge>
                              </div>
                              <div className="space-y-1 text-slate-500 pl-6">
                                <p><span className="font-semibold text-slate-600">Certificate #:</span> {c.certificate_number}</p>
                                <p><span className="font-semibold text-slate-600">Issued By:</span> {c.issuing_authority}</p>
                                <p><span className="font-semibold text-slate-600">Valid Period:</span> {c.issue_date} → {c.expiry_date}</p>
                              </div>
                              {isWritable && (
                                <div className="flex justify-end gap-1.5 mt-3 pt-2 border-t border-slate-50">
                                  <button onClick={() => handleEditCertClick(c)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => handleDeleteCert(c.id)} className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
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
          </div>
        </div>
      )}
    </div>
  )
}

export default Drivers
