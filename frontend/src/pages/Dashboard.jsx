import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';
import Ambulances from './Ambulances';
import Drivers from './Drivers';

const Dashboard = () => {
  const { user, logout, changePassword } = useAuth();
  
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
  const showAmbulanceTab = ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER', 'DISPATCHER'].includes(userRole);

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
        <div className="nav-user-info">
          <span className="nav-role-badge">{userRole}</span>
          <button className="logout-btn" onClick={logout}>Sign Out</button>
        </div>
      </nav>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1 className="welcome-title">Welcome back, {user?.name}!</h1>
          <p className="welcome-subtitle">Hospital Ambulance Fleet Management & Emergency Dispatch Platform</p>
          
          {showAmbulanceTab && (
            <div className="dashboard-tabs">
              <button 
                className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                👤 Profile & Security
              </button>
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
            </div>
          )}
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
        {activeTab === 'ambulances' && <Ambulances />}
        {activeTab === 'drivers' && <Drivers />}
      </main>
    </div>
  );
};

export default Dashboard;
