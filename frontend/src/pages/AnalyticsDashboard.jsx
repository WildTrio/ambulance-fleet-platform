import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = ({ type }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/dashboards/${type}/`);
      setData(response.data);
    } catch (err) {
      console.error(`Error fetching ${type} dashboard:`, err);
      setError(`Failed to load ${type} dashboard metrics.`);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Auto polling: 10s for dispatcher dashboard, 30s for fleet, 60s for admin
    const pollInterval = type === 'dispatcher' ? 10000 : type === 'fleet' ? 30000 : 60000;
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, pollInterval);

    return () => clearInterval(interval);
  }, [type]);

  if (loading) {
    return (
      <div className="analytics-loading-container">
        <div className="analytics-spinner"></div>
        <p>Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-error-container">
        <span className="error-icon">⚠️</span>
        <p>{error}</p>
        <button onClick={() => fetchDashboardData()} className="retry-btn">Try Again</button>
      </div>
    );
  }

  if (!data) return null;

  // Render individual dashboards
  if (type === 'dispatcher') {
    return (
      <div className="analytics-dashboard-view">
        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card critical-glow">
            <span className="kpi-icon">🚨</span>
            <div className="kpi-content">
              <span className="kpi-label">Pending Emergency Requests</span>
              <h3 className="kpi-value">{data.pending_requests_count}</h3>
            </div>
          </div>
          <div className="kpi-card warning-glow">
            <span className="kpi-icon">⚡</span>
            <div className="kpi-content">
              <span className="kpi-label">Active Missions Deployed</span>
              <h3 className="kpi-value">{data.active_missions_count}</h3>
            </div>
          </div>
          <div className="kpi-card success-glow">
            <span className="kpi-icon">🚑</span>
            <div className="kpi-content">
              <span className="kpi-label">Ambulances Available (Standby)</span>
              <h3 className="kpi-value">{data.available_ambulances_count}</h3>
            </div>
          </div>
        </div>

        {/* Dispatcher Workspace Tables */}
        <div className="dashboard-sections-grid-3">
          {/* Column 1: Pending requests */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Pending Queue ({data.pending_requests_count})</h4>
              <span className="live-pulse-badge">LIVE</span>
            </header>
            <div className="section-body scrollable-panel">
              {data.pending_requests.length === 0 ? (
                <div className="empty-panel-state">No pending emergency requests. Queue is clear!</div>
              ) : (
                <div className="panel-list">
                  {data.pending_requests.map(req => (
                    <div key={req.id} className={`panel-list-item priority-${req.priority.toLowerCase()}`}>
                      <div className="item-main">
                        <span className="item-title">{req.requester_name}</span>
                        <span className={`priority-pill pill-${req.priority.toLowerCase()}`}>{req.priority}</span>
                      </div>
                      <div className="item-sub">
                        <span>📋 {req.emergency_type}</span>
                        <span>📍 {req.pickup_location}</span>
                      </div>
                      <span className="item-time">Logged {new Date(req.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Column 2: Active missions */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Active Missions ({data.active_missions_count})</h4>
            </header>
            <div className="section-body scrollable-panel">
              {data.active_missions.length === 0 ? (
                <div className="empty-panel-state">No active dispatch missions currently en route.</div>
              ) : (
                <div className="panel-list">
                  {data.active_missions.map(m => (
                    <div key={m.id} className="panel-list-item">
                      <div className="item-main">
                        <span className="item-title">🚑 {m.ambulance?.ambulance_number || 'N/A'}</span>
                        <span className="status-pill badge-active">{m.status.replace('_', ' ')}</span>
                      </div>
                      <div className="item-sub">
                        <span>👤 Driver: {m.driver?.name || 'N/A'}</span>
                        <span>👤 Patient: {m.emergency_request?.requester_name || 'N/A'} ({m.emergency_request?.emergency_type})</span>
                      </div>
                      <span className="item-time">Started {new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Column 3: Available Ambulances */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Available Fleet ({data.available_ambulances_count})</h4>
            </header>
            <div className="section-body scrollable-panel">
              {data.available_ambulances.length === 0 ? (
                <div className="empty-panel-state">No standby ambulances. All active vehicles are dispatched!</div>
              ) : (
                <div className="panel-list">
                  {data.available_ambulances.map(amb => (
                    <div key={amb.id} className="panel-list-item">
                      <div className="item-main">
                        <span className="item-title">🚑 {amb.ambulance_number}</span>
                        <span className="type-badge">{amb.type}</span>
                      </div>
                      <div className="item-sub">
                        <span>🏥 Base: {amb.station?.station_name || amb.hospital?.hospital_name}</span>
                        {amb.current_latitude && amb.current_longitude && (
                          <span>📍 Coords: {parseFloat(amb.current_latitude).toFixed(4)}, {parseFloat(amb.current_longitude).toFixed(4)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (type === 'fleet') {
    const summary = data.fleet_summary;
    return (
      <div className="analytics-dashboard-view">
        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card info-glow">
            <span className="kpi-icon">📊</span>
            <div className="kpi-content">
              <span className="kpi-label">Fleet Availability Rate</span>
              <h3 className="kpi-value">{summary.availability_rate}%</h3>
            </div>
          </div>
          <div className="kpi-card">
            <span className="kpi-icon">🚛</span>
            <div className="kpi-content">
              <span className="kpi-label">Total Fleet Size</span>
              <h3 className="kpi-value">{summary.total_ambulances}</h3>
            </div>
          </div>
          <div className="kpi-card success-glow">
            <span className="kpi-icon">👥</span>
            <div className="kpi-content">
              <span className="kpi-label">Drivers On Duty</span>
              <h3 className="kpi-value">{data.driver_availability.on_duty_count} / {data.driver_availability.total_drivers}</h3>
            </div>
          </div>
        </div>

        {/* Fleet Breakdown & Maintenance Logs */}
        <div className="dashboard-sections-grid-2">
          {/* Section 1: Fleet Status & Lifecycle Breakdown */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Ambulance Status Distribution</h4>
            </header>
            <div className="section-body status-summary-flex">
              <div className="status-bars-container">
                <h5>Administrative Status</h5>
                <div className="status-bar-row">
                  <span className="status-lbl">Active</span>
                  <div className="progress-track">
                    <div className="progress-fill active-color" style={{ width: `${(summary.by_status.ACTIVE / Math.max(1, summary.total_ambulances)) * 100}%` }}></div>
                  </div>
                  <span className="status-val">{summary.by_status.ACTIVE}</span>
                </div>
                <div className="status-bar-row">
                  <span className="status-lbl">Maintenance</span>
                  <div className="progress-track">
                    <div className="progress-fill maintenance-color" style={{ width: `${(summary.by_status.MAINTENANCE / Math.max(1, summary.total_ambulances)) * 100}%` }}></div>
                  </div>
                  <span className="status-val">{summary.by_status.MAINTENANCE}</span>
                </div>
                <div className="status-bar-row">
                  <span className="status-lbl">Inactive</span>
                  <div className="progress-track">
                    <div className="progress-fill inactive-color" style={{ width: `${(summary.by_status.INACTIVE / Math.max(1, summary.total_ambulances)) * 100}%` }}></div>
                  </div>
                  <span className="status-val">{summary.by_status.INACTIVE}</span>
                </div>
              </div>

              <div className="lifecycle-grid-container">
                <h5>Operational Lifecycle</h5>
                <div className="lifecycle-badge-grid">
                  {Object.entries(summary.by_lifecycle).map(([statusKey, count]) => (
                    <div key={statusKey} className="lifecycle-badge-card">
                      <span className="lifecycle-count">{count}</span>
                      <span className="lifecycle-name">{statusKey.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Maintenance list */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Ambulances Under Maintenance / Sanitization ({data.maintenance_list.length})</h4>
            </header>
            <div className="section-body scrollable-panel">
              {data.maintenance_list.length === 0 ? (
                <div className="empty-panel-state">No vehicles currently under maintenance or in sanitization.</div>
              ) : (
                <table className="dashboard-table-mini">
                  <thead>
                    <tr>
                      <th>Ambulance</th>
                      <th>Reason / Phase</th>
                      <th>Entered At</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.maintenance_list.map(amb => (
                      <tr key={amb.id}>
                        <td><strong>{amb.ambulance_number}</strong></td>
                        <td>
                          <span className={`status-pill ${amb.lifecycle_status === 'SANITIZATION' ? 'badge-sanitization' : 'badge-maintenance'}`}>
                            {amb.lifecycle_status === 'SANITIZATION' ? 'SANITIZATION' : amb.status}
                          </span>
                        </td>
                        <td>{new Date(amb.entered_at).toLocaleString()}</td>
                        <td className="remarks-td" title={amb.remarks}>{amb.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* Section 3: Driver Shift & Assignment Roster */}
        <section className="dashboard-section-card full-width-section">
          <header className="section-header">
            <h4>Driver Schedule & Standby Roster</h4>
          </header>
          <div className="section-body">
            {data.driver_availability.active_drivers_list.length === 0 ? (
              <div className="empty-panel-state">No registered drivers found.</div>
            ) : (
              <div className="driver-roster-grid">
                {data.driver_availability.active_drivers_list.map(d => (
                  <div key={d.id} className="driver-roster-card">
                    <div className="driver-card-header">
                      <span className="driver-name">👤 {d.name}</span>
                      <div className="driver-lights">
                        <span className={`status-dot ${d.on_duty ? 'green-light' : 'gray-light'}`} title={d.on_duty ? 'On Duty (Active Shift)' : 'Off Duty'}></span>
                        <span className={`status-dot ${d.availability ? 'green-light' : 'red-light'}`} title={d.availability ? 'Available for Dispatch' : 'Occupied on Mission'}></span>
                      </div>
                    </div>
                    <div className="driver-card-body">
                      <div className="roster-row">
                        <span className="roster-lbl">Duty Status:</span>
                        <span className="roster-val">{d.on_duty ? 'ON DUTY' : 'OFF DUTY'}</span>
                      </div>
                      <div className="roster-row">
                        <span className="roster-lbl">Dispatch Availability:</span>
                        <span className={`roster-val ${d.availability ? 'text-success' : 'text-danger'}`}>
                          {d.availability ? 'AVAILABLE' : 'OCCUPIED'}
                        </span>
                      </div>
                      <div className="roster-row">
                        <span className="roster-lbl">Assigned Vehicle:</span>
                        <span className="roster-val"><strong>{d.assigned_ambulance ? `🚑 ${d.assigned_ambulance}` : 'None'}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (type === 'admin') {
    const responseMetrics = data.response_time_metrics;
    const missionStats = data.mission_statistics;
    const util = data.fleet_utilization;
    const ops = data.operational_performance;

    return (
      <div className="analytics-dashboard-view">
        {/* KPI Cards */}
        <div className="kpi-grid-4">
          <div className="kpi-card purple-glow">
            <span className="kpi-icon">⏱️</span>
            <div className="kpi-content">
              <span className="kpi-label">Avg Response Time</span>
              <h3 className="kpi-value">{responseMetrics.average_response_time_minutes} mins</h3>
            </div>
          </div>
          <div className="kpi-card success-glow">
            <span className="kpi-icon">🏆</span>
            <div className="kpi-content">
              <span className="kpi-label">Mission Success Rate</span>
              <h3 className="kpi-value">{missionStats.success_rate}%</h3>
            </div>
          </div>
          <div className="kpi-card info-glow">
            <span className="kpi-icon">📈</span>
            <div className="kpi-content">
              <span className="kpi-label">Active Utilization Rate</span>
              <h3 className="kpi-value">{util.active_utilization_rate}%</h3>
            </div>
          </div>
          <div className="kpi-card">
            <span className="kpi-icon">⏳</span>
            <div className="kpi-content">
              <span className="kpi-label">Cumulative Trip Hours</span>
              <h3 className="kpi-value">{util.total_trip_hours} hrs</h3>
            </div>
          </div>
        </div>

        {/* Analysis Details */}
        <div className="dashboard-sections-grid-2">
          {/* Section 1: Response Times by Severity & Daily Trends */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Response Time Analysis</h4>
            </header>
            <div className="section-body priority-rt-flex">
              <div className="priority-bars-container">
                <h5>Response Times by Priority</h5>
                {Object.entries(responseMetrics.by_priority).map(([priority, val]) => (
                  <div key={priority} className="status-bar-row">
                    <span className="status-lbl">{priority}</span>
                    <div className="progress-track">
                      <div className={`progress-fill priority-color-${priority.toLowerCase()}`} style={{ width: `${Math.min(100, (val / 30.0) * 100)}%` }}></div>
                    </div>
                    <span className="status-val">{val} mins</span>
                  </div>
                ))}
                <span className="sub-helper text-center">*Bars scaled relative to target of 30 minutes</span>
              </div>

              <div className="trends-table-container">
                <h5>Daily Response Time Trends</h5>
                <div className="scrollable-trends-table">
                  {responseMetrics.daily_trends.length === 0 ? (
                    <div className="empty-panel-state">No historical daily trends found.</div>
                  ) : (
                    <table className="dashboard-table-mini">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Avg Response Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responseMetrics.daily_trends.map(t => (
                          <tr key={t.date}>
                            <td>{t.date}</td>
                            <td><strong>{t.avg_response_time_minutes} mins</strong></td>
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
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Operational Bottleneck Finder (Avg Phase Duration)</h4>
            </header>
            <div className="section-body">
              <div className="bottleneck-bars-container">
                {Object.entries(ops.average_phase_durations_minutes).map(([phase, val]) => (
                  <div key={phase} className="status-bar-row">
                    <span className="status-lbl phase-lbl">{phase.replace('_', ' ')}</span>
                    <div className="progress-track large-track">
                      <div className="progress-fill bottleneck-color" style={{ width: `${Math.min(100, (val / 45.0) * 100)}%` }}></div>
                    </div>
                    <span className="status-val"><strong>{val} mins</strong></span>
                  </div>
                ))}
              </div>
              <p className="analysis-summary" style={{ marginTop: '16px', fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4' }}>
                💡 <strong>Bottleneck Insight:</strong> Phases like Sanitization and Hospital Arrival with higher durations indicate longer vehicle turnover. Address these to increase operational frequency.
              </p>
            </div>
          </section>
        </div>

        {/* Section 3: General Mission Statistics & Daily Volume */}
        <div className="dashboard-sections-grid-2">
          {/* Mission Stats Breakdown */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Mission Volume & Performance Statistics</h4>
            </header>
            <div className="section-body">
              <div className="details-list">
                <div className="detail-row">
                  <span className="detail-label">Total Missions Initiated:</span>
                  <span className="detail-value">{missionStats.total_missions}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Missions Successfully Completed:</span>
                  <span className="detail-value text-success">{missionStats.completed_missions}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Missions Cancelled / Aborted:</span>
                  <span className="detail-value text-danger">{missionStats.cancelled_missions}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Average Trip Duration:</span>
                  <span className="detail-value"><strong>{missionStats.average_trip_duration_minutes} minutes</strong></span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Average Trip Distance:</span>
                  <span className="detail-value"><strong>{missionStats.average_trip_distance_km} km</strong></span>
                </div>
              </div>
            </div>
          </section>

          {/* Daily Volumes table */}
          <section className="dashboard-section-card">
            <header className="section-header">
              <h4>Daily Mission Volume Trends</h4>
            </header>
            <div className="section-body scrollable-panel">
              {ops.daily_mission_volume.length === 0 ? (
                <div className="empty-panel-state">No volume trends logged yet.</div>
              ) : (
                <table className="dashboard-table-mini">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Missions Dispatched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.daily_mission_volume.map(v => (
                      <tr key={v.date}>
                        <td>{v.date}</td>
                        <td><strong>{v.missions_count} cases</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return null;
};

export default AnalyticsDashboard;
