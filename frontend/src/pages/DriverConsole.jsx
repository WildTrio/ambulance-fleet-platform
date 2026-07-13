import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import './DriverConsole.css';
import toast from 'react-hot-toast';

const DriverConsole = () => {
  const [ambulance, setAmbulance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsExpanded, setTripsExpanded] = useState(false);

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

  const fetchTrips = async () => {
    setTripsLoading(true);
    try {
      const response = await api.get('/trips/my-trips/');
      setTrips(response.data);
    } catch (err) {
      console.error("Error fetching driver trips:", err);
    } finally {
      setTripsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignment();
    fetchTrips();
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
      toast.success(`Successfully transitioned to ${getStatusLabel(targetStatus)}`);
      setRemarks('');
      
      // Refresh assignment, history & trips
      await fetchAssignment();
      fetchTrips();
    } catch (err) {
      console.error("Error transitioning status:", err);
      const detail = err.response?.data?.detail || "Failed to transition status.";
      setError(detail);
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const activeMission = ambulance?.active_mission;

  // Map and Tracking References
  const driverMapRef = useRef(null);
  const driverMarkersRef = useRef(null);
  const driverRouteRef = useRef(null);
  const [simulating, setSimulating] = useState(false);
  const [useDeviceGPS, setUseDeviceGPS] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  // Initialize Map
  useEffect(() => {
    if (!window.L || !ambulance) return;
    const mapContainer = document.getElementById('driver-map');
    if (!mapContainer) return;

    if (!driverMapRef.current) {
      const defaultLat = ambulance.current_latitude ? parseFloat(ambulance.current_latitude) : (ambulance.station ? parseFloat(ambulance.station.latitude) : 21.820600);
      const defaultLon = ambulance.current_longitude ? parseFloat(ambulance.current_longitude) : (ambulance.station ? parseFloat(ambulance.station.longitude) : 75.609400);

      const map = window.L.map('driver-map').setView([defaultLat, defaultLon], 14);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      driverMarkersRef.current = window.L.layerGroup().addTo(map);
      driverMapRef.current = map;
      setCurrentCoords({ latitude: defaultLat, longitude: defaultLon });
    }
  }, [ambulance]);

  // Fetch Route when activeMission changes
  useEffect(() => {
    if (!ambulance || !activeMission || !driverMapRef.current) return;

    const fetchRoute = async () => {
      try {
        const response = await api.get(`/missions/${activeMission.id}/route/`);
        const data = response.data;
        setRouteInfo(data);

        if (driverRouteRef.current) {
          driverMapRef.current.removeLayer(driverRouteRef.current);
          driverRouteRef.current = null;
        }

        if (data.route && data.route.length > 0) {
          const polyline = window.L.polyline(data.route, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.8
          }).addTo(driverMapRef.current);
          driverRouteRef.current = polyline;
          driverMapRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] });
        }
      } catch (err) {
        console.error("Error fetching route in driver console:", err);
      }
    };

    fetchRoute();
  }, [ambulance, activeMission?.id, ambulance?.lifecycle_status]);

  // GPS Simulation Loop
  useEffect(() => {
    if (!simulating || !routeInfo?.route || routeInfo.route.length === 0 || !ambulance) {
      return;
    }

    let currentIndex = 0;
    const routePoints = routeInfo.route;

    const interval = setInterval(async () => {
      if (currentIndex >= routePoints.length) {
        setSimulating(false);
        clearInterval(interval);
        return;
      }

      const point = routePoints[currentIndex];
      const nextLat = point[0];
      const nextLon = point[1];

      setCurrentCoords({ latitude: nextLat, longitude: nextLon });

      try {
        await api.post(`/ambulances/${ambulance.id}/update-location/`, {
          latitude: nextLat,
          longitude: nextLon
        });
      } catch (err) {
        console.error("Error updating simulated location:", err);
      }

      currentIndex++;
    }, 4000);

    return () => clearInterval(interval);
  }, [simulating, routeInfo, ambulance]);

  // Turn off simulator if device GPS is enabled
  useEffect(() => {
    if (useDeviceGPS) setSimulating(false);
  }, [useDeviceGPS]);

  // Turn off device GPS if simulator is enabled
  useEffect(() => {
    if (simulating) setUseDeviceGPS(false);
  }, [simulating]);

  // HTML5 Device Geolocation API Tracking
  useEffect(() => {
    if (!useDeviceGPS || !navigator.geolocation || !ambulance) return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentCoords({ latitude, longitude });

        try {
          await api.post(`/ambulances/${ambulance.id}/update-location/`, {
            latitude,
            longitude
          });
        } catch (err) {
          console.error("Error updating location from device GPS:", err);
        }
      },
      (err) => {
        console.error("Error watching device position:", err);
        toast.error("Unable to retrieve GPS coordinates from device: " + err.message);
        setUseDeviceGPS(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [useDeviceGPS, ambulance]);

  // Update Markers
  useEffect(() => {
    if (!driverMapRef.current || !driverMarkersRef.current) return;
    const markers = driverMarkersRef.current;
    markers.clearLayers();

    if (currentCoords) {
      window.L.circleMarker([currentCoords.latitude, currentCoords.longitude], {
        radius: 9,
        fillColor: '#3b82f6',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(markers).bindPopup("Your Location");
    }

    if (routeInfo?.destination) {
      const dest = routeInfo.destination;
      window.L.circleMarker([dest.latitude, dest.longitude], {
        radius: 9,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(markers).bindPopup(`Destination: ${dest.name}`);
    }
  }, [currentCoords, routeInfo]);

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

          <section className="driver-card map-card" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h3>Live Navigation & GPS</h3>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label className="checkbox-label" style={{ fontWeight: '700', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }} title="Query your actual device's physical GPS sensor">
                  <input
                    type="checkbox"
                    checked={useDeviceGPS}
                    onChange={(e) => setUseDeviceGPS(e.target.checked)}
                    style={{ accentColor: '#10b981' }}
                  />
                  Use Device GPS
                </label>
                {activeMission && (
                  <label className="checkbox-label" style={{ fontWeight: '700', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }} title="Simulate movement along the route">
                    <input
                      type="checkbox"
                      checked={simulating}
                      onChange={(e) => setSimulating(e.target.checked)}
                      style={{ accentColor: '#6366f1' }}
                    />
                    Simulate Route
                  </label>
                )}
              </div>
            </div>
            {activeMission && routeInfo && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '12px', fontSize: '0.82rem', color: '#cbd5e1' }}>
                <span>Distance: <strong style={{ color: '#a5b4fc' }}>{routeInfo.distance_km} km</strong></span>
                <span>ETA: <strong style={{ color: '#a5b4fc' }}>{routeInfo.eta_minutes} mins</strong></span>
                <span>Destination: <strong>{routeInfo.destination?.name}</strong></span>
              </div>
            )}
            <div id="driver-map" style={{ height: '280px', borderRadius: '12px', background: '#090d16', border: '1px solid rgba(255,255,255,0.06)', zIndex: 1 }}></div>
          </section>

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

          <section className="driver-card trips-card" style={{ marginTop: '20px' }}>
            <div className="trips-card-header" onClick={() => setTripsExpanded(!tripsExpanded)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Past Trips History</h3>
                <p className="section-subtitle" style={{ margin: 0 }}>Your completed and cancelled trips</p>
              </div>
              <button className="expand-toggle-btn" style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '1.2rem', cursor: 'pointer' }}>
                {tripsExpanded ? '▲' : '▼'}
              </button>
            </div>

            {tripsExpanded && (
              <div className="trips-list-container" style={{ marginTop: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                {tripsLoading ? (
                  <p style={{ color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic' }}>Loading trips...</p>
                ) : trips.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.88rem', fontStyle: 'italic' }}>No past trips recorded.</p>
                ) : (
                  <div className="trips-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {trips.map((trip) => (
                      <div key={trip.id} className="trip-item" style={{ background: 'rgba(255, 255, 255, 0.015)', border: '1px solid rgba(255, 255, 255, 0.04)', borderRadius: '10px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span className={`status-pill ${trip.status === 'COMPLETED' ? 'badge-ready' : 'badge-sanitization'}`} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px' }}>
                            {trip.status}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {trip.start_time ? new Date(trip.start_time).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '0.82rem', color: '#cbd5e1' }}>
                          <div>
                            <span style={{ color: '#64748b' }}>Distance:</span> <strong>{trip.distance_km} km</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Duration:</span> <strong>
                              {trip.start_time && trip.end_time 
                                ? `${Math.max(0, Math.round((new Date(trip.end_time) - new Date(trip.start_time)) / 60000))} mins`
                                : '0 mins'
                              }
                            </strong>
                          </div>
                        </div>
                        {trip.summary && (
                          <p style={{ fontSize: '0.8rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', margin: 0, fontStyle: 'italic', lineHeight: '1.4' }}>
                            "{trip.summary}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default DriverConsole;
