import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './Dashboard.css';
import Ambulances from './Ambulances';
import Drivers from './Drivers';
import EmergencyRequests from './EmergencyRequests';
import DispatchConsole from './DispatchConsole';
import DriverConsole from './DriverConsole';
import TripsHistory from './TripsHistory';
import AnalyticsDashboard from './AnalyticsDashboard';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { user, logout, changePassword } = useAuth();
  
  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifiedIdsRef = useRef(new Set());

  // Fetch unread notifications for badge count
  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/?unread=true');
      const unreadItems = response.data;
      setUnreadCount(unreadItems.length);

      // Trigger alerts for new unread notifications
      unreadItems.forEach(item => {
        if (!notifiedIdsRef.current.has(item.id)) {
          notifiedIdsRef.current.add(item.id);
          
          // Trigger React Hot Toast in-app notification
          toast(
            <div>
              <strong>{item.title}</strong>
              <div style={{ fontSize: '0.78rem', marginTop: '4px', opacity: 0.9 }}>{item.message}</div>
            </div>,
            { 
              icon: '🔔',
              style: {
                borderLeft: '4px solid #6366f1'
              }
            }
          );


        }
      });
    } catch (err) {
      console.error("Error fetching unread notification count:", err);
    }
  };

  // Fetch all recent notifications for the dropdown list
  const fetchAllNotifications = async () => {
    try {
      const response = await api.get('/notifications/');
      setNotifications(response.data);
    } catch (err) {
      console.error("Error fetching notifications list:", err);
    }
  };

  // Initialize notifications polling and permission request
  useEffect(() => {
    if (!user) return;
    


    fetchUnreadCount();

    const interval = setInterval(fetchUnreadCount, 8000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch all recent when dropdown is opened
  useEffect(() => {
    if (showNotifDropdown) {
      fetchAllNotifications();
    }
  }, [showNotifDropdown]);

  // Close dropdown on outside clicks
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.notif-bell-container')) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/notifications/${id}/`, { is_read: true });
      fetchUnreadCount();
      fetchAllNotifications();
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read/');
      fetchUnreadCount();
      fetchAllNotifications();
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
    }
  };

  // Simple time elapsed helper
  const formatTimeAgo = (dateStr) => {
    const diffMs = new Date() - new Date(dateStr);
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  
  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSuccess, setPwSuccess] = useState(null);
  const [pwError, setPwError] = useState(null);
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwSuccess("Password updated successfully.");
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err.new_password) {
        setPwError(`New Password: ${err.new_password[0]}`);
      } else if (err.old_password) {
        setPwError(`Old Password: ${err.old_password[0]}`);
      } else if (err.detail) {
        setPwError(err.detail);
      } else if (typeof err === 'object') {
        const key = Object.keys(err)[0];
        setPwError(`${key}: ${err[key][0]}`);
      } else {
        setPwError("Failed to update password.");
      }
    } finally {
      setPwLoading(false);
    }
  };

  const userRole = typeof user?.role === 'object' ? user.role?.name : user?.role;
  const [activeTab, setActiveTab] = useState('profile');
  const showEmergencyQueueTab = ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'].includes(userRole);
  const showEmergencyRequestorTab = ['EMERGENCY_REQUESTOR'].includes(userRole);
  const showAmbulanceTab = ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER'].includes(userRole);
  const showDispatchConsoleTab = ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'].includes(userRole);
  const showDriverConsoleTab = ['DRIVER'].includes(userRole);
  const showTripHistoryTab = ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'].includes(userRole);
  const showDispatcherDashboard = ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'].includes(userRole);
  const showFleetDashboard = ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER'].includes(userRole);
  const showAdminDashboard = ['HOSPITAL_ADMINISTRATOR'].includes(userRole);

  return (
    <div className="dashboard-container">
      <div className="background-decor">
        <div className="glow-sphere sphere-1"></div>
        <div className="glow-sphere sphere-2"></div>
      </div>

      <nav className="dashboard-navbar">
        <div className="nav-brand">
          <span className="brand-icon">🚨</span>
          <span className="nav-brand-title">Lifeline Dispatch</span>
        </div>
        <div className="nav-user-info" style={{ display: 'flex', alignItems: 'center' }}>
          {/* Notifications Dropdown Bell */}
          <div className="notif-bell-container" style={{ position: 'relative', marginRight: '16px' }}>
            <button 
              className={`notif-bell-btn ${showNotifDropdown ? 'active' : ''}`}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                transition: 'all 0.2s'
              }}
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            >
              🔔
              {unreadCount > 0 && (
                <span 
                  className="notif-badge"
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: '#ef4444',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifDropdown && (
              <div 
                className="notif-dropdown"
                style={{
                  position: 'absolute',
                  top: '46px',
                  right: '0',
                  width: '320px',
                  background: '#0d1527',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '400px',
                  overflow: 'hidden'
                }}
              >
                <header 
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.02)'
                  }}
                >
                  <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>Notifications</strong>
                  {unreadCount > 0 && (
                    <button 
                      onClick={handleMarkAllRead}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#6366f1',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </header>

                <div 
                  className="notif-list scrollable"
                  style={{
                    overflowY: 'auto',
                    flex: '1',
                    maxHeight: '320px'
                  }}
                >
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div 
                        key={notif.id}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          background: notif.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.2s'
                        }}
                        onClick={(e) => !notif.is_read && handleMarkAsRead(notif.id, e)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: notif.is_read ? '#94a3b8' : '#ffffff' }}>
                            {notif.title}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {formatTimeAgo(notif.created_at)}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: notif.is_read ? '#64748b' : '#cbd5e1', lineHeight: '1.4' }}>
                          {notif.message}
                        </p>
                        {!notif.is_read && (
                          <button
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            style={{
                              alignSelf: 'flex-end',
                              background: 'transparent',
                              border: 'none',
                              color: '#6366f1',
                              fontSize: '0.72rem',
                              padding: '2px 0',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
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
          <span className="nav-role-badge">{userRole}</span>
          <button className="logout-btn" onClick={logout}>Sign Out</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1 className="welcome-title">Welcome back, {user?.name}!</h1>
          <p className="welcome-subtitle">Hospital Ambulance Fleet Management & Emergency Dispatch Platform</p>
          
          <div className="dashboard-tabs">
            <button 
              className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              👤 Profile & Security
            </button>
            {showDispatcherDashboard && (
              <button 
                className={`tab-btn ${activeTab === 'dispatcher-dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dispatcher-dashboard')}
              >
                📊 Dispatcher Dashboard
              </button>
            )}
            {showFleetDashboard && (
              <button 
                className={`tab-btn ${activeTab === 'fleet-dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('fleet-dashboard')}
              >
                🚛 Fleet Dashboard
              </button>
            )}
            {showAdminDashboard && (
              <button 
                className={`tab-btn ${activeTab === 'admin-dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('admin-dashboard')}
              >
                📈 Admin Analytics
              </button>
            )}
            {showEmergencyQueueTab && (
              <button 
                className={`tab-btn ${activeTab === 'emergency-queue' ? 'active' : ''}`}
                onClick={() => setActiveTab('emergency-queue')}
              >
                🚨 Emergency Queue
              </button>
            )}
            {showDispatchConsoleTab && (
              <button 
                className={`tab-btn ${activeTab === 'dispatch-console' ? 'active' : ''}`}
                onClick={() => setActiveTab('dispatch-console')}
              >
                🖥️ Dispatch Console
              </button>
            )}
            {showTripHistoryTab && (
              <button 
                className={`tab-btn ${activeTab === 'trip-history' ? 'active' : ''}`}
                onClick={() => setActiveTab('trip-history')}
              >
                🗺️ Trip History & Reports
              </button>
            )}
            {showDriverConsoleTab && (
              <button 
                className={`tab-btn ${activeTab === 'driver-console' ? 'active' : ''}`}
                onClick={() => setActiveTab('driver-console')}
              >
                🎮 Driver Console
              </button>
            )}
            {showEmergencyRequestorTab && (
              <button 
                className={`tab-btn ${activeTab === 'emergency-requests' ? 'active' : ''}`}
                onClick={() => setActiveTab('emergency-requests')}
              >
                🚨 Emergency Requests
              </button>
            )}
            {showAmbulanceTab && (
              <>
                <button 
                  className={`tab-btn ${activeTab === 'ambulances' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ambulances')}
                >
                  🚑 Ambulance Fleet
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'drivers' ? 'active' : ''}`}
                  onClick={() => setActiveTab('drivers')}
                >
                  👥 Drivers
                </button>
              </>
            )}
          </div>
        </header>

        {activeTab === 'profile' && (
          <div className="dashboard-grid">
            {/* User Profile Card */}
            <section className="dashboard-card profile-card">
              <h2 className="card-title">User Account Info</h2>
              <div className="profile-details">
                <div className="detail-row">
                  <span className="detail-label">Full Name</span>
                  <span className="detail-value">{user?.name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email Address</span>
                  <span className="detail-value">{user?.email}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Access Role</span>
                  <span className="detail-value role-highlight">{userRole}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Member Since</span>
                  <span className="detail-value">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </section>

            {/* Password Management Card */}
            <section className="dashboard-card password-card">
              <h2 className="card-title">Password Management</h2>
              <form onSubmit={handlePasswordChange} className="password-form">
                {pwError && (
                  <div className="form-alert alert-error">
                    <span className="alert-icon">⚠️</span>
                    <span>{pwError}</span>
                  </div>
                )}
                {pwSuccess && (
                  <div className="form-alert alert-success">
                    <span className="alert-icon">✅</span>
                    <span>{pwSuccess}</span>
                  </div>
                )}

                <div className="input-group">
                  <label htmlFor="old-password">Current Password</label>
                  <input
                    id="old-password"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    disabled={pwLoading}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="new-password">New Password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    disabled={pwLoading}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="confirm-password">Confirm New Password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    required
                    disabled={pwLoading}
                  />
                </div>

                <button type="submit" className="submit-pw-btn" disabled={pwLoading}>
                  {pwLoading ? <span className="spinner-mini"></span> : 'Update Password'}
                </button>
              </form>
            </section>
          </div>
        )}
        {activeTab === 'dispatcher-dashboard' && <AnalyticsDashboard type="dispatcher" />}
        {activeTab === 'fleet-dashboard' && <AnalyticsDashboard type="fleet" />}
        {activeTab === 'admin-dashboard' && <AnalyticsDashboard type="admin" />}
        {activeTab === 'ambulances' && <Ambulances />}
        {activeTab === 'drivers' && <Drivers />}
        {(activeTab === 'emergency-queue' || activeTab === 'emergency-requests') && <EmergencyRequests />}
        {activeTab === 'dispatch-console' && <DispatchConsole />}
        {activeTab === 'driver-console' && <DriverConsole />}
        {activeTab === 'trip-history' && <TripsHistory />}
      </main>
    </div>
  );
};

export default Dashboard;
