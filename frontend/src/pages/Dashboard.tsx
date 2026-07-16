import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  User,
  Lock,
  LayoutDashboard,
  Truck,
  BarChart3,
  AlertTriangle,
  Monitor,
  Map,
  Compass,
  Bell,
  Activity,
  Users,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Menu,
  Shield,
} from "lucide-react"

// @ts-expect-error - AuthContext is currently .jsx
import { useAuth } from "../context/AuthContext"
import api from "../services/api"


// @ts-expect-error - legacy component
import Ambulances from "./Ambulances"
// @ts-expect-error - legacy component
import Drivers from "./Drivers"
// @ts-expect-error - legacy component
import EmergencyRequests from "./EmergencyRequests"
// @ts-expect-error - legacy component
import DispatchConsole from "./DispatchConsole"
// @ts-expect-error - legacy component
import DriverConsole from "./DriverConsole"
// @ts-expect-error - legacy component
import TripsHistory from "./TripsHistory"
// @ts-expect-error - legacy component
import AnalyticsDashboard from "./AnalyticsDashboard"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { notify } from "@/components/ui/Toast"

interface NotificationItem {
  id: number
  title: string
  message: string
  created_at: string
  is_read: boolean
}

export default function Dashboard() {
  const { user, logout, changePassword } = useAuth()
  const navigate = useNavigate()

  // Sidebar collapsible and responsive state
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const notifiedIdsRef = useRef<Set<number>>(new Set())

  // Fetch unread notifications for badge count
  const fetchUnreadCount = async () => {
    try {
      const response = await api.get("/notifications/?unread=true")
      const unreadItems = response.data as NotificationItem[]
      setUnreadCount(unreadItems.length)

      // Trigger alerts for new unread notifications
      unreadItems.forEach((item) => {
        if (!notifiedIdsRef.current.has(item.id)) {
          notifiedIdsRef.current.add(item.id)
          notify.info(`${item.title}: ${item.message}`)
        }
      })
    } catch (err) {
      console.error("Error fetching unread notification count:", err)
    }
  }

  // Fetch all recent notifications for the dropdown list
  const fetchAllNotifications = async () => {
    try {
      const response = await api.get("/notifications/")
      setNotifications(response.data as NotificationItem[])
    } catch (err) {
      console.error("Error fetching notifications list:", err)
    }
  }

  // Initialize notifications polling and permission request
  useEffect(() => {
    if (!user) return

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 8000)
    return () => clearInterval(interval)
  }, [user])

  // Fetch all recent when dropdown is opened
  useEffect(() => {
    if (showNotifDropdown) {
      fetchAllNotifications()
    }
  }, [showNotifDropdown])

  // Close dropdown on outside clicks
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(".notif-bell-container")) {
        setShowNotifDropdown(false)
      }
    }
    document.addEventListener("click", handleOutsideClick)
    return () => document.removeEventListener("click", handleOutsideClick)
  }, [])

  const handleMarkAsRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.patch(`/notifications/${id}/`, { is_read: true })
      fetchUnreadCount()
      fetchAllNotifications()
    } catch (err) {
      console.error("Error marking notification as read:", err)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.post("/notifications/mark-all-read/")
      fetchUnreadCount()
      fetchAllNotifications()
      notify.success("All notifications marked as read")
    } catch (err) {
      console.error("Error marking all notifications as read:", err)
    }
  }

  // Simple time elapsed helper
  const formatTimeAgo = (dateStr: string) => {
    const diffMs = new Date().getTime() - new Date(dateStr).getTime()
    const diffMins = Math.max(0, Math.floor(diffMs / 60000))
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return new Date(dateStr).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })
  }

  // Password change state
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwLoading, setPwLoading] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      notify.error("New passwords do not match.")
      return
    }

    setPwLoading(true)
    try {
      await changePassword(oldPassword, newPassword)
      notify.success("Password updated successfully.")
      setOldPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      let errorMsg = "Failed to update password."
      if (err?.new_password) {
        errorMsg = `New Password: ${err.new_password[0]}`
      } else if (err?.old_password) {
        errorMsg = `Old Password: ${err.old_password[0]}`
      } else if (err?.detail) {
        errorMsg = err.detail
      } else if (typeof err === "object" && err !== null) {
        const keys = Object.keys(err)
        if (keys.length > 0) {
          const key = keys[0]
          errorMsg = `${key}: ${err[key][0]}`
        }
      }
      notify.error(errorMsg)
    } finally {
      setPwLoading(false)
    }
  }

  const userRole = typeof user?.role === "object" ? user.role?.name : user?.role
  const [activeTab, setActiveTab] = useState("profile")

  // Role verification maps
  const showEmergencyQueueTab = ["HOSPITAL_ADMINISTRATOR", "DISPATCHER"].includes(userRole)
  const showEmergencyRequestorTab = ["EMERGENCY_REQUESTOR"].includes(userRole)
  const showAmbulanceTab = ["HOSPITAL_ADMINISTRATOR", "FLEET_MANAGER", "DISPATCHER"].includes(userRole)
  const showDispatchConsoleTab = ["HOSPITAL_ADMINISTRATOR", "DISPATCHER"].includes(userRole)
  const showDriverConsoleTab = ["DRIVER"].includes(userRole)
  const showTripHistoryTab = ["HOSPITAL_ADMINISTRATOR", "DISPATCHER"].includes(userRole)
  const showDispatcherDashboard = ["HOSPITAL_ADMINISTRATOR", "DISPATCHER"].includes(userRole)
  const showFleetDashboard = ["HOSPITAL_ADMINISTRATOR", "FLEET_MANAGER"].includes(userRole)
  const showAdminDashboard = ["HOSPITAL_ADMINISTRATOR"].includes(userRole)

  // Sidebar Menu categories and tabs definition
  const navigationItems = [
    {
      category: "Personal Workspace",
      items: [
        { id: "profile", label: "Profile & Security", icon: User },
        ...(showDriverConsoleTab ? [{ id: "driver-console", label: "Driver Console", icon: Compass }] : []),
        ...(showEmergencyRequestorTab ? [{ id: "emergency-requests", label: "Emergency Requests", icon: Bell }] : []),
      ],
    },
    {
      category: "Analytics & Status",
      items: [
        ...(showDispatcherDashboard ? [{ id: "dispatcher-dashboard", label: "Dispatcher KPIs", icon: LayoutDashboard }] : []),
        ...(showFleetDashboard ? [{ id: "fleet-dashboard", label: "Fleet KPIs", icon: Truck }] : []),
        ...(showAdminDashboard ? [{ id: "admin-dashboard", label: "Admin Analytics", icon: BarChart3 }] : []),
      ],
    },
    {
      category: "Operations Center",
      items: [
        ...(showEmergencyQueueTab ? [{ id: "emergency-queue", label: "Emergency Queue", icon: AlertTriangle }] : []),
        ...(showDispatchConsoleTab ? [{ id: "dispatch-console", label: "Dispatch Console", icon: Monitor }] : []),
        ...(showTripHistoryTab ? [{ id: "trip-history", label: "Trip History & Logs", icon: Map }] : []),
      ],
    },
    {
      category: "Fleet Management",
      items: [
        ...(showAmbulanceTab ? [{ id: "ambulances", label: "Ambulance Fleet", icon: Activity }] : []),
        ...(showAmbulanceTab ? [{ id: "drivers", label: "Drivers Profiles", icon: Users }] : []),
      ],
    },
  ]

  const handleLogoutClick = async () => {
    try {
      await logout()
      notify.success("Successfully logged out")
      navigate("/login")
    } catch {
      notify.error("Error logging out")
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-body text-slate-600 relative">
      {/* Mobile Drawer Overlay Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out transform lg:static lg:translate-x-0 ${isMobileOpen ? "translate-x-0" : "-translate-x-full"
          } ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div className="flex flex-col overflow-y-auto scrollable py-6 flex-1">
          {/* Logo Header */}
          <div className={`px-6 flex items-center justify-between mb-8 ${isCollapsed ? "lg:justify-center" : ""}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-soft shrink-0">
                <Shield className="h-5 w-5 text-red-500" />
              </div>
              {!isCollapsed && (
                <span className="font-sans font-bold text-lg text-slate-900 tracking-tight">
                  Lifeline
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg shrink-0"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation Items grouped by category */}
          <nav className="flex-1 px-4 space-y-6">
            {navigationItems.map((group) => {
              if (group.items.length === 0) return null
              return (
                <div key={group.category} className="space-y-1.5">
                  {!isCollapsed ? (
                    <h4 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {group.category}
                    </h4>
                  ) : (
                    <div className="h-px bg-slate-100 my-2 mx-2" />
                  )}
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = activeTab === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id)
                            setIsMobileOpen(false) // Auto-close drawer on mobile
                          }}
                          className={`w-full flex items-center rounded-lg text-sm font-medium transition-all ${isCollapsed
                              ? "justify-center p-2.5"
                              : "justify-between px-3 py-2"
                            } ${isActive
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          title={isCollapsed ? item.label : undefined}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`h-4.5 w-4.5 ${isActive ? "text-white" : "text-slate-400"} shrink-0`} />
                            {!isCollapsed && <span>{item.label}</span>}
                          </div>
                          {!isCollapsed && isActive && <ChevronRight className="h-3.5 w-3.5 text-white shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Footer User Details */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <div className={`flex items-center justify-between gap-2 ${isCollapsed ? "flex-col" : "flex-row"}`}>
            {!isCollapsed ? (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {user?.email}
                </p>
              </div>
            ) : (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-1 cursor-pointer"
                title={`${user?.name} (${user?.email})`}
              >
                <User className="h-4.5 w-4.5" />
              </div>
            )}
            <Button
              onClick={handleLogoutClick}
              variant="ghost"
              size="icon"
              className="hover:bg-red-50 hover:text-red-500 h-9 w-9 shrink-0"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-200 bg-white px-4 lg:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger menu */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg h-9 w-9"
              title="Open Navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <h1 className="text-lg lg:text-xl font-bold tracking-tight text-slate-900 font-sans capitalize truncate max-w-[140px] sm:max-w-none">
              {activeTab.replace("-", " ")}
            </h1>
            <Badge variant="secondary" className="px-2 py-0.5 text-[10px] lg:text-xs text-slate-500 rounded-full font-semibold uppercase tracking-wide whitespace-nowrap">
              {userRole}
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Inbox Bell */}
            <div className="relative notif-bell-container">
              <Button
                variant="outline"
                size="icon"
                className="relative rounded-lg hover:bg-slate-50 shadow-soft h-9 w-9 border-slate-200"
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              >
                <Bell className="h-4.5 w-4.5 text-slate-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emergency text-[9px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]">
                    {unreadCount}
                  </span>
                )}
              </Button>

              {showNotifDropdown && (
                <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5 flex flex-col max-h-96">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-900">
                      Notifications Inbox
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto scrollable flex-1 py-1 divide-y divide-slate-50">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={(e) => !notif.is_read && handleMarkAsRead(notif.id, e)}
                          className={`p-3 text-left transition-colors cursor-pointer rounded-lg hover:bg-slate-50 flex flex-col gap-1 ${notif.is_read ? "opacity-70" : "bg-blue-50/20"
                            }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-xs font-semibold text-slate-900">
                              {notif.title}
                            </span>
                            <span className="text-[9px] text-slate-400 shrink-0">
                              {formatTimeAgo(notif.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-normal">
                            {notif.message}
                          </p>
                          {!notif.is_read && (
                            <button
                              onClick={(e) => handleMarkAsRead(notif.id, e)}
                              className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 self-end mt-1"
                            >
                              Mark as read
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Workspace Panel */}
        <main className="flex-1 overflow-y-auto scrollable bg-slate-50 p-4 lg:p-8">
          {activeTab === "profile" && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Profile details */}
              <Card className="border border-slate-200 bg-white p-6 rounded-2xl shadow-soft">
                <CardHeader className="p-0 pb-6 border-b border-slate-100 flex flex-row items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      User Account Information
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-500 mt-0.5">
                      General credentials and authorization role details.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pt-6">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Full Name
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-950">
                        {user?.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Email Address
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-950">
                        {user?.email}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Access Authorization Role
                      </dt>
                      <dd className="mt-1 text-sm">
                        <Badge variant="outline" className="px-2.5 py-0.5 text-xs text-slate-700 bg-slate-50 font-bold uppercase tracking-wider">
                          {userRole}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Member Since
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-950">
                        {user?.created_at
                          ? new Date(user.created_at).toLocaleDateString([], {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                          : "N/A"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {/* Password update form */}
              <Card className="border border-slate-200 bg-white p-6 rounded-2xl shadow-soft">
                <CardHeader className="p-0 pb-6 border-b border-slate-100 flex flex-row items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Update Account Password
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-500 mt-0.5">
                      Ensure your system account credentials remain secure.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0 pt-6">
                  <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="old-password"
                        className="block text-xs font-semibold text-slate-600 uppercase tracking-wider"
                      >
                        Current Password
                      </label>
                      <Input
                        id="old-password"
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Type current password"
                        required
                        disabled={pwLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="new-password"
                        className="block text-xs font-semibold text-slate-600 uppercase tracking-wider"
                      >
                        New Password
                      </label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Type new password"
                        required
                        disabled={pwLoading}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="confirm-password"
                        className="block text-xs font-semibold text-slate-600 uppercase tracking-wider"
                      >
                        Confirm New Password
                      </label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type new password"
                        required
                        disabled={pwLoading}
                      />
                    </div>

                    <Button type="submit" className="font-semibold px-6" disabled={pwLoading}>
                      {pwLoading ? "Updating..." : "Update Password"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Child active components mapping */}
          {activeTab === "dispatcher-dashboard" && <AnalyticsDashboard type="dispatcher" />}
          {activeTab === "fleet-dashboard" && <AnalyticsDashboard type="fleet" />}
          {activeTab === "admin-dashboard" && <AnalyticsDashboard type="admin" />}
          {activeTab === "ambulances" && <Ambulances />}
          {activeTab === "drivers" && <Drivers />}
          {(activeTab === "emergency-queue" || activeTab === "emergency-requests") && <EmergencyRequests />}
          {activeTab === "dispatch-console" && <DispatchConsole />}
          {activeTab === "driver-console" && <DriverConsole />}
          {activeTab === "trip-history" && <TripsHistory />}
        </main>
      </div>
    </div>
  )
}
