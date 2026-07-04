import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './DriverConsole.css';

const DriverConsole = () => {
  const [ambulance, setAmbulance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchAssignment = async () => {
    try {
      const response = await api.get('/ambulances/my-assignment/');
      setAmbulance(response.data);
      if (response.data?.id) {
        fetchHistory(response.data.id);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching driver assignment:", err);
      if (err.response && err.response.status === 404) {
        setAmbulance(null);
      } else {
        setError("Failed to fetch assignment details.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (ambulanceId) => {
    try {
      const response = await api.get(`/ambulances/${ambulanceId}/lifecycle-history/`);
      setHistory(response.data);
    } catch (err) {
      console.error("Error fetching lifecycle history:", err);
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, []);

  const handleTransition = async (targetStatus) => {
    if (!ambulance) return;
    setSubmitting(true);
    setSuccessMsg('');
    setError(null);

    try {
      const response = await api.post(`/ambulances/${ambulance.id}/transition-lifecycle/`, {
        status: targetStatus,
        remarks: remarks || `Transitioned to ${targetStatus} by driver.`
      });
      setSuccessMsg(`Successfully transitioned to ${targetStatus}`);
      setRemarks('');
      
      // Refresh assignment & history
      await fetchAssignment();
    } catch (err) {
      console.error("Error transitioning status:", err);
      const detail = err.response?.data?.detail || "Failed to transition status.";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="driver-console-loading">
        <div className="panel-spinner"></div>
        <p>Loading your vehicle assignment...</p>
      </div>
    );
  }

  if (!ambulance) {
    return (
      <div className="driver-no-assignment">
        <div className="no-assignment-card">
          <span className="no-assignment-icon">🔑</span>
          <h2>No Active Ambulance Assignment</h2>
          <p>You currently do not have an active ambulance assignment. Please contact a Fleet Manager or Dispatcher to assign you to a vehicle to begin your shift.</p>
          <button className="refresh-assignment-btn" onClick={fetchAssignment}>
            🔄 Refresh Status
          </button>
        </div>
      </div>
    );
  }

  const currentStatus = ambulance.lifecycle_status || 'AVAILABLE';
  const activeMission = ambulance.active_mission;

  // Define valid next states based on transition engine
  const LIFECYCLE_TRANSITIONS = {
    'AVAILABLE': ['ASSIGNED'],
    'ASSIGNED': ['EN_ROUTE', 'AVAILABLE'],
    'EN_ROUTE': ['AT_INCIDENT', 'AVAILABLE'],
    'AT_INCIDENT': ['PATIENT_ONBOARD', 'AVAILABLE'],
    'PATIENT_ONBOARD': ['HOSPITAL_ARRIVAL', 'SANITIZATION', 'AVAILABLE'],
    'HOSPITAL_ARRIVAL': ['SANITIZATION', 'AVAILABLE'],
    'SANITIZATION': ['READY', 'AVAILABLE'],
    'READY': ['AVAILABLE'],
  };

  const nextValidStatuses = LIFECYCLE_TRANSITIONS[currentStatus] || [];

  const getStatusLabel = (status) => {
    switch (status) {
      case 'AVAILABLE': return 'Available';
      case 'ASSIGNED': return 'Assigned';
      case 'EN_ROUTE': return 'En Route';
      case 'AT_INCIDENT': return 'At Incident';
      case 'PATIENT_ONBOARD': return 'Patient Onboard';
      case 'HOSPITAL_ARRIVAL': return 'Hospital Arrival';
      case 'SANITIZATION': return 'Sanitization';
      case 'READY': return 'Ready';
      default: return status;
    }
  };

  const getStatusColorClass = (status) => {
    switch (status) {
      case 'AVAILABLE': return 'badge-available';
      case 'ASSIGNED': return 'badge-assigned';
      case 'EN_ROUTE': return 'badge-enroute';
      case 'AT_INCIDENT': return 'badge-atincident';
      case 'PATIENT_ONBOARD': return 'badge-onboard';
      case 'HOSPITAL_ARRIVAL': return 'badge-hospital';
      case 'SANITIZATION': return 'badge-sanitization';
      case 'READY': return 'badge-ready';
      default: return '';
    }
  };

  const getStatusEmoji = (status) => {
    switch (status) {
      case 'AVAILABLE': return '🟢';
      case 'ASSIGNED': return '📋';
      case 'EN_ROUTE': return '🚑';
      case 'AT_INCIDENT': return '📍';
      case 'PATIENT_ONBOARD': return '👤';
      case 'HOSPITAL_ARRIVAL': return '🏥';
      case 'SANITIZATION': return '🧼';
      case 'READY': return '✅';
      default: return '➡️';
    }
  };

  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'CRITICAL': return 'priority-critical';
      case 'HIGH': return 'priority-high';
      case 'MEDIUM': return 'priority-medium';
      case 'LOW': return 'priority-low';
      default: return '';
    }
  };

  // Define full stepper sequence for visual alignment
  const fullSteps = [
    'ASSIGNED',
    'EN_ROUTE',
    'AT_INCIDENT',
    'PATIENT_ONBOARD',
    'HOSPITAL_ARRIVAL',
    'SANITIZATION',
    'READY'
  ];

  const getStepIndex = (status) => fullSteps.indexOf(status);
  const currentStepIndex = getStepIndex(currentStatus);

  return (
    <div className="driver-console-container">
      {error && (
        <div className="driver-error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="driver-success-banner">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg('')}>✕</button>
        </div>
      )}

      <div className="driver-layout">
        {/* Left Column: Vehicle Info, Active Mission, Status controls */}
        <div className="driver-main-panel">
          <section className="driver-card vehicle-info-card">
            <div className="vehicle-info-header">
              <div>
                <span className="info-lbl">Active Ambulance</span>
                <h2>{ambulance.ambulance_number}</h2>
              </div>
              <span className={`status-pill ${getStatusColorClass(currentStatus)}`}>
                {getStatusEmoji(currentStatus)} {getStatusLabel(currentStatus)}
              </span>
            </div>
            <div className="vehicle-info-details">
              <div className="info-item">
                <span className="info-lbl">Type</span>
                <span className="info-val">{ambulance.type}</span>
              </div>
              <div className="info-item">
                <span className="info-lbl">Hospital Base</span>
                <span className="info-val">{ambulance.hospital?.hospital_name || 'N/A'}</span>
              </div>
              <div className="info-item">
                <span className="info-lbl">Station</span>
                <span className="info-val">{ambulance.station?.station_name || 'N/A'}</span>
              </div>
            </div>
          </section>

          {activeMission ? (
            <section className="driver-card mission-details-card">
              <div className="card-header-with-badge">
                <h3>Active Dispatch Mission</h3>
                <span className={`priority-badge ${getPriorityBadgeClass(activeMission.priority)}`}>
                  {activeMission.priority}
                </span>
              </div>
              <div className="mission-details-grid">
                <div className="mission-detail-row">
                  <span className="info-lbl">Emergency Type</span>
                  <span className="info-val highlight-val">{activeMission.emergency_type}</span>
                </div>
                <div className="mission-detail-row">
                  <span className="info-lbl">Patient Name</span>
                  <span className="info-val">{activeMission.requester_name}</span>
                </div>
                <div className="mission-detail-row full-width">
                  <span className="info-lbl">Pickup Location</span>
                  <span className="info-val location-val">📍 {activeMission.pickup_location}</span>
                </div>
              </div>

              {/* Graphical Stepper */}
              <div className="driver-stepper-container">
                <div className="driver-stepper">
                  {fullSteps.map((step, idx) => {
                    const isCompleted = currentStepIndex >= idx && currentStatus !== 'AVAILABLE';
                    const isCurrent = currentStepIndex === idx;
                    return (
                      <React.Fragment key={step}>
                        {idx > 0 && (
                          <div className={`stepper-line ${currentStepIndex >= idx && currentStatus !== 'AVAILABLE' ? 'completed' : ''}`}></div>
                        )}
                        <div 
                          className={`stepper-dot-wrap ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                          title={getStatusLabel(step)}
                        >
                          <div className="stepper-dot">
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          <span className="stepper-label">{getStatusLabel(step).split(' ')[0]}</span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : (
            <section className="driver-card no-mission-card">
              <span className="no-mission-icon">🟢</span>
              <h3>No Active Mission</h3>
              <p>You are currently available on standby. A dispatcher will assign an emergency request to you when needed.</p>
            </section>
          )}

          <section className="driver-card transition-controls-card">
            <h3>Update Operational Status</h3>
            <p className="section-subtitle">Transition to the next phase of the mission lifecycle:</p>
            
            <div className="transition-buttons-grid">
              {nextValidStatuses
                .filter(status => status !== 'AVAILABLE' && status !== 'ASSIGNED')
                .map((status) => (
                  <button
                    key={status}
                    className={`transition-action-btn btn-${status.toLowerCase()}`}
                    onClick={() => handleTransition(status)}
                    disabled={submitting}
                  >
                    <span className="btn-emoji">{getStatusEmoji(status)}</span>
                    <span className="btn-text">Transition to {getStatusLabel(status)}</span>
                  </button>
                ))
              }

              {/* Only show Complete (AVAILABLE) when status is READY */}
              {nextValidStatuses.includes('AVAILABLE') && currentStatus === 'READY' && (
                <button
                  className="transition-action-btn btn-available"
                  onClick={() => {
                    if (window.confirm("Complete this mission and return to AVAILABLE status?")) {
                      handleTransition('AVAILABLE');
                    }
                  }}
                  disabled={submitting}
                >
                  <span className="btn-emoji">🟢</span>
                  <span className="btn-text">Complete Mission (Available)</span>
                </button>
              )}

              {/* Show empty state if no driver-actionable transitions exist */}
              {!nextValidStatuses.some(status => 
                (status !== 'AVAILABLE' && status !== 'ASSIGNED') || 
                (status === 'AVAILABLE' && currentStatus === 'READY')
              ) && (
                <p className="no-transitions-msg">No transitions available from current status.</p>
              )}
            </div>

            <div className="remarks-input-group">
              <label htmlFor="remarks-field">Operational Remarks (Optional)</label>
              <textarea
                id="remarks-field"
                rows="3"
                placeholder="Enter any status update remarks (e.g. traffic delay, sanitization complete detail)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={submitting}
              />
            </div>
          </section>
        </div>

        {/* Right Column: Audit Trail / Timeline Log */}
        <div className="driver-history-panel">
          <section className="driver-card history-card">
            <h3>Lifecycle Log Timeline</h3>
            <p className="section-subtitle">Real-time audit history of status updates for this vehicle:</p>
            
            <div className="timeline-container">
              {history.length === 0 ? (
                <div className="timeline-empty">No status transition logs recorded.</div>
              ) : (
                <div className="timeline">
                  {history.map((log) => (
                    <div key={log.id} className="timeline-item">
                      <div className="timeline-badge-wrap">
                        <span className="timeline-emoji">{getStatusEmoji(log.to_status)}</span>
                        <div className="timeline-connector"></div>
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-status-change">
                            {getStatusLabel(log.from_status)} ➔ <strong>{getStatusLabel(log.to_status)}</strong>
                          </span>
                          <span className="timeline-time">
                            {new Date(log.changed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        {log.remarks && <p className="timeline-remarks">"{log.remarks}"</p>}
                        <span className="timeline-user-meta">By: {log.changed_by_name || 'System'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DriverConsole;
