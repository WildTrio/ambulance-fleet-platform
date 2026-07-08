import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import './DispatchConsole.css';
import { useAuth } from '../context/AuthContext';

const DispatchConsole = () => {
  const { user } = useAuth();
  const userRole = typeof user?.role === 'object' ? user.role?.name : user?.role;
  const isAuthorized = ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'].includes(userRole);

  // States
  const [requests, setRequests] = useState([]);
  const [missions, setMissions] = useState([]);
  const [nearbyAmbulances, setNearbyAmbulances] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  
  // Loading & Error States
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingMissions, setLoadingMissions] = useState(true);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [submittingDispatch, setSubmittingDispatch] = useState(false);
  const [error, setError] = useState(null);
  const [dispatchSuccess, setDispatchSuccess] = useState('');
  const [dispatchError, setDispatchError] = useState('');

  // Fetch initial data
  const fetchActiveRequests = async () => {
    try {
      // Fetch only PENDING requests for dispatch intake
      const response = await api.get('/emergency-requests/?status=PENDING');
      setRequests(response.data);
    } catch (err) {
      console.error("Error fetching requests:", err);
      setError("Failed to fetch pending requests.");
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchActiveMissions = async () => {
    try {
      const response = await api.get('/missions/?active=true');
      setMissions(response.data);
    } catch (err) {
      console.error("Error fetching missions:", err);
      setError("Failed to fetch active missions.");
    } finally {
      setLoadingMissions(false);
    }
  };

  const fetchAvailableDrivers = async () => {
    try {
      const response = await api.get('/drivers/?available=true');
      setAvailableDrivers(response.data);
    } catch (err) {
      console.error("Error fetching available drivers:", err);
    }
  };

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!isAuthorized) return;
    fetchActiveRequests();
    fetchActiveMissions();
    fetchAvailableDrivers();

    const interval = setInterval(() => {
      fetchActiveRequests();
      fetchActiveMissions();
      fetchAvailableDrivers();
    }, 10000);

    return () => clearInterval(interval);
  }, [isAuthorized]);

  // Recommendation Engine States
  const [useRecommendation, setUseRecommendation] = useState(true);
  const [maxDistance, setMaxDistance] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [onlyWithDriver, setOnlyWithDriver] = useState(false);
  const [requiredEquipment, setRequiredEquipment] = useState('');

  const fetchNearbyAmbulances = async () => {
    if (!selectedRequest) return;
    setLoadingNearby(true);
    setDispatchError('');
    try {
      let endpoint = `/ambulances/nearby/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`;
      
      if (useRecommendation) {
        endpoint = `/ambulances/recommend/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`;
        if (maxDistance) {
          endpoint += `&max_distance=${maxDistance}`;
        }
        if (selectedType) {
          endpoint += `&type=${encodeURIComponent(selectedType)}`;
        }
        if (onlyWithDriver) {
          endpoint += `&has_driver=true`;
        }
        if (requiredEquipment) {
          endpoint += `&required_equipment=${encodeURIComponent(requiredEquipment)}`;
        }
      }
      
      const response = await api.get(endpoint);
      setNearbyAmbulances(response.data);
    } catch (err) {
      console.error("Error fetching recommended ambulances:", err);
      setDispatchError("Could not calculate ambulance recommendations.");
    } finally {
      setLoadingNearby(false);
    }
  };

  // Handle selected request change to search nearby/recommended ambulances
  useEffect(() => {
    setDispatchSuccess('');
    setDispatchError('');
    if (!selectedRequest) {
      setNearbyAmbulances([]);
      setSelectedAmbulance(null);
      setSelectedDriverId('');
      return;
    }
    fetchNearbyAmbulances();
    setSelectedAmbulance(null);
    setSelectedDriverId('');
  }, [selectedRequest, useRecommendation, maxDistance, selectedType, onlyWithDriver, requiredEquipment]);

  // Reset selected driver when the selected ambulance changes
  useEffect(() => {
    setSelectedDriverId('');
  }, [selectedAmbulance]);

  // Handle Dispatch submission
  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!selectedRequest || !selectedAmbulance) return;

    // Validation
    const needsDriver = !selectedAmbulance.active_driver;
    if (needsDriver && !selectedDriverId) {
      setDispatchError("Please assign an available driver first.");
      return;
    }

    setSubmittingDispatch(true);
    setDispatchError('');
    setDispatchSuccess('');

    const payload = {
      emergency_request_id: selectedRequest.id,
      ambulance_id: selectedAmbulance.id,
    };

    if (needsDriver && selectedDriverId) {
      payload.driver_id = selectedDriverId;
    }

    try {
      await api.post('/missions/', payload);
      setDispatchSuccess(`Successfully dispatched ${selectedAmbulance.ambulance_number}!`);
      
      // Refresh console lists
      fetchActiveRequests();
      fetchActiveMissions();
      fetchAvailableDrivers();
      
      // Reset selections
      setSelectedRequest(null);
      setSelectedAmbulance(null);
      setSelectedDriverId('');
    } catch (err) {
      console.error("Dispatch error:", err);
      const msg = err.response?.data?.detail || err.response?.data?.ambulance_id?.[0] || err.response?.data?.driver_id?.[0] || "Failed to dispatch mission.";
      setDispatchError(msg);
    } finally {
      setSubmittingDispatch(false);
    }
  };

  // Handle driver assignment on-the-fly
  const handleAssignDriver = async (driverId) => {
    if (!selectedAmbulance || !driverId) return;

    setDispatchError('');
    setDispatchSuccess('');

    try {
      await api.post(`/ambulances/${selectedAmbulance.id}/assign-driver/`, { driver_id: driverId });
      setDispatchSuccess(`Driver assigned to ${selectedAmbulance.ambulance_number} successfully!`);

      // Update selected driver ID state
      setSelectedDriverId(driverId);

      // Re-fetch available drivers
      fetchAvailableDrivers();

      // Refresh nearby/recommended list to get the updated status and active driver
      if (selectedRequest) {
        let endpoint = `/ambulances/nearby/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`;
        if (useRecommendation) {
          endpoint = `/ambulances/recommend/?latitude=${selectedRequest.latitude}&longitude=${selectedRequest.longitude}`;
          if (maxDistance) {
            endpoint += `&max_distance=${maxDistance}`;
          }
          if (selectedType) {
            endpoint += `&type=${encodeURIComponent(selectedType)}`;
          }
          if (onlyWithDriver) {
            endpoint += `&has_driver=true`;
          }
          if (requiredEquipment) {
            endpoint += `&required_equipment=${encodeURIComponent(requiredEquipment)}`;
          }
        }
        const response = await api.get(endpoint);
        setNearbyAmbulances(response.data);

        // Find the updated selected ambulance from response
        const updatedSelected = response.data.find(amb => amb.id === selectedAmbulance.id);
        if (updatedSelected) {
          setSelectedAmbulance(updatedSelected);
        }
      }
    } catch (err) {
      console.error("Failed to assign driver:", err);
      const msg = err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || "Failed to assign driver.";
      setDispatchError(msg);
      // Reset dropdown value
      setSelectedDriverId('');
    }
  };

  // Transition mission status
  const handleTransitionMission = async (missionId, nextStatus) => {
    try {
      await api.patch(`/missions/${missionId}/`, { status: nextStatus });
      fetchActiveMissions();
      fetchActiveRequests();
    } catch (err) {
      console.error("Mission status update failed:", err);
      alert(err.response?.data?.detail || "Failed to update mission status.");
    }
  };

  // Map and Tracking States
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const routeRef = useRef(null);
  const hasFittedBoundsRef = useRef(false);
  const hasFittedRouteRef = useRef(false);
  const [activeTrackedMission, setActiveTrackedMission] = useState(null);
  const [trackedMissionRoute, setTrackedMissionRoute] = useState(null);

  // Reset auto-fitting flags when selections change
  useEffect(() => {
    hasFittedBoundsRef.current = false;
  }, [selectedRequest?.id, selectedAmbulance?.id, activeTrackedMission?.id]);

  useEffect(() => {
    hasFittedRouteRef.current = false;
  }, [activeTrackedMission?.id]);

  // Initialize Map
  useEffect(() => {
    if (!isAuthorized || !window.L) return;
    const mapContainer = document.getElementById('dispatch-map');
    if (!mapContainer) return;

    if (!mapRef.current) {
      const map = window.L.map('dispatch-map').setView([21.820600, 75.609400], 12);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);
      
      markersRef.current = window.L.layerGroup().addTo(map);
      mapRef.current = map;
    }
  }, [isAuthorized]);

  // Update Markers when selections change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    const markers = markersRef.current;
    markers.clearLayers();

    const bounds = [];

    // Selected Incident Marker
    if (selectedRequest) {
      const reqLat = parseFloat(selectedRequest.latitude);
      const reqLon = parseFloat(selectedRequest.longitude);
      if (!isNaN(reqLat) && !isNaN(reqLon)) {
        window.L.circleMarker([reqLat, reqLon], {
          radius: 10,
          fillColor: '#ef4444',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(markers).bindPopup(`
          <strong>Incident: ${selectedRequest.emergency_type}</strong><br/>
          Location: ${selectedRequest.pickup_location}<br/>
          Priority: ${selectedRequest.priority}
        `);
        bounds.push([reqLat, reqLon]);
      }
    }

    // Nearby / Recommended Ambulances Markers
    nearbyAmbulances.forEach(amb => {
      const lat = amb.current_latitude !== null ? parseFloat(amb.current_latitude) : (amb.station ? parseFloat(amb.station.latitude) : null);
      const lon = amb.current_longitude !== null ? parseFloat(amb.current_longitude) : (amb.station ? parseFloat(amb.station.longitude) : null);

      if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
        const isSelected = selectedAmbulance?.id === amb.id;
        window.L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: isSelected ? '#6366f1' : '#3b82f6',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(markers).bindPopup(`
          <strong>Ambulance: ${amb.ambulance_number}</strong><br/>
          Status: ${amb.status} [${amb.lifecycle_status}]<br/>
          Type: ${amb.type}<br/>
          Distance: ${amb.distance !== null ? `${amb.distance} km` : 'N/A'}
        `);
        bounds.push([lat, lon]);
      }
    });

    // Active Missions Markers
    missions.forEach(mission => {
      const amb = mission.ambulance;
      if (!amb) return;
      const lat = amb.current_latitude !== null ? parseFloat(amb.current_latitude) : (amb.station ? parseFloat(amb.station.latitude) : null);
      const lon = amb.current_longitude !== null ? parseFloat(amb.current_longitude) : (amb.station ? parseFloat(amb.station.longitude) : null);

      if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
        const isTracked = activeTrackedMission?.id === mission.id;
        window.L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: isTracked ? '#10b981' : '#64748b',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(markers).bindPopup(`
          <strong>Mission Ambulance: ${amb.ambulance_number}</strong><br/>
          Status: ${mission.status}<br/>
          Driver: ${mission.driver?.name || 'N/A'}
        `);
        bounds.push([lat, lon]);
      }
    });

    if (bounds.length > 0 && !hasFittedBoundsRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
      hasFittedBoundsRef.current = true;
    }
  }, [selectedRequest, nearbyAmbulances, selectedAmbulance, missions, activeTrackedMission]);

  // Handle Tracked Route
  useEffect(() => {
    if (!mapRef.current) return;
    
    if (routeRef.current) {
      mapRef.current.removeLayer(routeRef.current);
      routeRef.current = null;
    }

    if (!activeTrackedMission) {
      setTrackedMissionRoute(null);
      return;
    }

    const fetchRoute = async () => {
      try {
        const response = await api.get(`/missions/${activeTrackedMission.id}/route/`);
        const routeData = response.data;
        setTrackedMissionRoute(routeData);

        if (routeData.route && routeData.route.length > 0) {
          const polyline = window.L.polyline(routeData.route, {
            color: '#10b981',
            weight: 4,
            opacity: 0.8,
            dashArray: '5, 10'
          }).addTo(mapRef.current);
          routeRef.current = polyline;
          
          if (!hasFittedRouteRef.current) {
            mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
            hasFittedRouteRef.current = true;
          }
        }
      } catch (err) {
        console.error("Error fetching mission route:", err);
      }
    };

    fetchRoute();
    const interval = setInterval(fetchRoute, 8000);
    return () => clearInterval(interval);
  }, [activeTrackedMission]);

  if (!isAuthorized) {
    return (
      <div className="forbidden-container">
        <h2>Access Denied</h2>
        <p>You do not have permissions to access the Operational Dispatch Console.</p>
      </div>
    );
  }

  const getPriorityLabel = (p) => {
    switch(p) {
      case 'CRITICAL': return '🚨 Critical';
      case 'HIGH': return '⚡ High';
      case 'MEDIUM': return '⚠️ Medium';
      case 'LOW': return '✓ Low';
      default: return p;
    }
  };

  const getMissionStatusStep = (status) => {
    switch(status) {
      case 'ASSIGNED': return 1;
      case 'EN_ROUTE': return 2;
      case 'ON_SITE':
      case 'AT_INCIDENT': return 3;
      case 'TRANSPORTING':
      case 'PATIENT_ONBOARD': return 4;
      case 'ARRIVED_HOSPITAL':
      case 'HOSPITAL_ARRIVAL': return 5;
      case 'SANITIZATION': return 6;
      case 'READY': return 7;
      default: return 1;
    }
  };

  return (
    <div className="dispatch-console-container">
      {error && (
        <div className="global-error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="dispatch-layout">
        {/* Left Panel: Active Incident Queue */}
        <aside className="dispatch-panel panel-left">
          <div className="panel-header">
            <h3>Active Incidents ({requests.length})</h3>
            <button className="panel-refresh-btn" onClick={fetchActiveRequests} title="Refresh active queue">🔄</button>
          </div>
          <div className="panel-content scrollable">
            {loadingRequests ? (
              <div className="panel-spinner-wrap"><div className="panel-spinner"></div></div>
            ) : requests.length === 0 ? (
              <div className="panel-empty-state">No pending emergency cases.</div>
            ) : (
              <div className="incident-list">
                {requests.map((req) => (
                  <div 
                    key={req.id} 
                    className={`incident-card priority-${req.priority.toLowerCase()} ${selectedRequest?.id === req.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRequest(req)}
                  >
                    <div className="incident-header">
                      <span className="incident-type">{req.emergency_type}</span>
                      <span className="incident-priority-badge">{getPriorityLabel(req.priority)}</span>
                    </div>
                    <p className="incident-loc">📍 {req.pickup_location}</p>
                    <div className="incident-footer">
                      <span className="incident-time">Logged {new Date(req.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <span className="incident-req-by">by {req.requester_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center Panel: Dispatch Command Card */}
        <section className="dispatch-panel panel-center">
          <div className="panel-header">
            <h3>Dispatch Incident Command</h3>
          </div>
          <div className="panel-content scrollable">
            {!selectedRequest ? (
              <div className="command-empty-state">
                <span className="empty-icon">🚨</span>
                <h4>Select an Incident to Dispatch</h4>
                <p>Select a pending incident from the active queue on the left to allocate an ambulance and driver.</p>
              </div>
            ) : (
              <div className="dispatch-card-wrapper">
                {/* selected incident details */}
                <div className="incident-details-box">
                  <h4>Incident details</h4>
                  <div className="incident-info-grid">
                    <div>
                      <span className="info-lbl">Requester</span>
                      <span className="info-val">{selectedRequest.requester_name} ({selectedRequest.contact_number})</span>
                    </div>
                    <div>
                      <span className="info-lbl">Medical Issue</span>
                      <span className="info-val text-red">{selectedRequest.emergency_type}</span>
                    </div>
                    <div>
                      <span className="info-lbl">Pickup Location</span>
                      <span className="info-val">📍 {selectedRequest.pickup_location}</span>
                    </div>
                    <div>
                      <span className="info-lbl">Coordinates</span>
                      <span className="info-val">({parseFloat(selectedRequest.latitude).toFixed(5)}, {parseFloat(selectedRequest.longitude).toFixed(5)})</span>
                    </div>
                  </div>
                </div>

                {/* alert banners */}
                {dispatchError && <div className="dispatch-alert alert-error">⚠️ {dispatchError}</div>}
                {dispatchSuccess && <div className="dispatch-alert alert-success">✅ {dispatchSuccess}</div>}

                {/* nearby ambulances */}
                <div className="nearby-ambulances-box">
                  <div className="nearby-header">
                    <h4>Allocate Ambulance {useRecommendation ? "(Ranked by Recommendation)" : "(Sorted by Distance)"}</h4>
                    {loadingNearby && <div className="spinner-mini"></div>}
                  </div>

                  {/* Recommendation Engine Filter Bar */}
                  <div className="recommendation-filter-bar">
                    <div className="filter-checkbox-group">
                      <label className="checkbox-label" title="Enable/disable the intelligent recommendation engine">
                        <input
                          type="checkbox"
                          checked={useRecommendation}
                          onChange={(e) => setUseRecommendation(e.target.checked)}
                        />
                        <strong>Use Intelligent Recommendation Engine</strong>
                      </label>
                    </div>

                    {useRecommendation && (
                      <div className="recommendation-filters">
                        <div className="filter-item">
                          <label>Max Dist (km):</label>
                          <input
                            type="number"
                            placeholder="e.g. 15"
                            value={maxDistance}
                            onChange={(e) => setMaxDistance(e.target.value)}
                            className="filter-input-small"
                            min="0"
                          />
                        </div>

                        <div className="filter-item">
                          <label>Type:</label>
                          <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="filter-select-small"
                          >
                            <option value="">All Types</option>
                            <option value="Basic Life Support">Basic Life Support</option>
                            <option value="Advanced Life Support">Advanced Life Support</option>
                            <option value="Patient Transport">Patient Transport</option>
                          </select>
                        </div>

                        <div className="filter-item">
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={onlyWithDriver}
                              onChange={(e) => setOnlyWithDriver(e.target.checked)}
                            />
                            Driver Assigned
                          </label>
                        </div>

                        <div className="filter-item">
                          <label>Equipment:</label>
                          <input
                            type="text"
                            placeholder="e.g. Ventilator"
                            value={requiredEquipment}
                            onChange={(e) => setRequiredEquipment(e.target.value)}
                            className="filter-input-medium"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {loadingNearby && nearbyAmbulances.length === 0 ? (
                    <div className="panel-spinner-wrap"><div className="panel-spinner"></div></div>
                  ) : nearbyAmbulances.length === 0 ? (
                    <p className="no-vehicles">No available vehicles matching parameters found.</p>
                  ) : (
                    <div className="vehicles-grid">
                      {nearbyAmbulances.map((amb) => {
                        const isSelected = selectedAmbulance?.id === amb.id;
                        const isReady = amb.readiness_info === 'Ready';
                        const isAvailable = amb.availability_status === 'AVAILABLE';
                        const isMaint = amb.status === 'MAINTENANCE';
                        const isInactive = amb.status === 'INACTIVE';
                        const isBusy = amb.availability_status === 'ON_MISSION';

                        let readinessClass = 'status-badge-gray';
                        if (isReady) readinessClass = 'status-badge-green';
                        else if (amb.readiness_info === 'No Driver') readinessClass = 'status-badge-yellow';
                        else if (isBusy) readinessClass = 'status-badge-blue';
                        else if (isMaint || isInactive) readinessClass = 'status-badge-red';

                        return (
                          <div 
                            key={amb.id}
                            className={`vehicle-row-card ${isSelected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}`}
                            onClick={() => isAvailable && setSelectedAmbulance(amb)}
                          >
                            <div className="veh-card-header">
                              <span className="veh-num">🚑 {amb.ambulance_number}</span>
                              
                              {useRecommendation && amb.recommendation_score !== undefined && (
                                <span className="score-badge" title={`Base driver score: ${amb.score_breakdown?.base_driver_score} pts\nDistance penalty: -${amb.score_breakdown?.distance_penalty} pts\nEquipment score: +${amb.score_breakdown?.equipment_score} pts`}>
                                  Score: <strong>{amb.recommendation_score}</strong>
                                </span>
                              )}
                            </div>
                            
                            <div className="veh-card-body">
                              <div className="veh-details-line">
                                <span className="veh-type-badge">⚙️ {amb.type}</span>
                                <span className={`status-pill ${readinessClass}`}>
                                  {amb.readiness_info}
                                </span>
                              </div>
                              
                              <div className="veh-details-line">
                                <span className="station-name-text">Station: <strong>{amb.station?.station_name || 'N/A'}</strong></span>
                              </div>
                              
                              <div className="veh-details-line">
                                <span>Dist: <strong className="text-indigo">{amb.distance !== null ? `${amb.distance} km` : 'N/A'}</strong></span>
                                <span>ETA: <strong className="text-indigo">{amb.eta !== null ? `${amb.eta} mins` : 'N/A'}</strong></span>
                              </div>
                              
                              {useRecommendation && amb.score_breakdown && (
                                <div className="score-breakdown-inline">
                                  <div className="breakdown-row">
                                    <span>Driver Score:</span>
                                    <strong>{amb.score_breakdown.base_driver_score} pts</strong>
                                  </div>
                                  <div className="breakdown-row">
                                    <span>Distance Penalty:</span>
                                    <strong className="text-red">-{Number(amb.score_breakdown.distance_penalty).toFixed(1)} pts</strong>
                                  </div>
                                  <div className="breakdown-row">
                                    <span>Equipment Score:</span>
                                    <strong className="text-green">+{Number(amb.score_breakdown.equipment_score).toFixed(1)} pts</strong>
                                  </div>
                                </div>
                              )}
                              
                              {amb.equipment && amb.equipment.length > 0 && (
                                <div className="veh-details-line veh-equipment-line">
                                  <span className="equipment-list-text">
                                    🔧 {amb.equipment.join(', ')}
                                  </span>
                                </div>
                              )}
                              
                              <div className="veh-details-line veh-driver-line">
                                <span>Driver: <strong>{amb.active_driver ? amb.active_driver.name : 'None Assigned'}</strong></span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* driver assignment (if selected vehicle has no driver) */}
                {selectedAmbulance && !selectedAmbulance.active_driver && (
                  <div className="driver-on-fly-box pulse-anim">
                    <h5>👥 Driver Assignment Required</h5>
                    <p className="driver-instruction">This ambulance is available but has no active driver. Assign an available driver below to dispatch immediately.</p>
                    <div className="input-group">
                      <select 
                        value={selectedDriverId} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedDriverId(val);
                          if (val) {
                            handleAssignDriver(val);
                          }
                        }}
                        required
                      >
                        <option value="">-- Select Available Driver --</option>
                        {availableDrivers.map((drv) => (
                          <option key={drv.id} value={drv.id}>
                            👤 {drv.name} (Lic: {drv.license_number})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* dispatch execution */}
                <form onSubmit={handleDispatch} className="dispatch-form-action">
                  <button 
                    type="submit" 
                    className="dispatch-action-btn"
                    disabled={submittingDispatch || !selectedAmbulance}
                  >
                    {submittingDispatch ? (
                      <span className="spinner-mini"></span>
                    ) : (
                      `🚀 Dispatch ${selectedAmbulance ? selectedAmbulance.ambulance_number : 'Selected Vehicle'}`
                    )}
                  </button>
                </form>
              </div>
            )}
            {/* Live Operations Map */}
            <div className="map-panel-box" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', margin: 0 }}>
                  Live Operations Map
                </h4>
                {activeTrackedMission && (
                  <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                    Tracking: {activeTrackedMission.ambulance?.ambulance_number} ({trackedMissionRoute ? `${trackedMissionRoute.distance_km} km, ${trackedMissionRoute.eta_minutes} mins ETA` : 'loading...'})
                    <button 
                      style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => setActiveTrackedMission(null)}
                    >
                      ✕ Stop Tracking
                    </button>
                  </div>
                )}
              </div>
              <div id="dispatch-map" style={{ height: '320px', borderRadius: '12px', background: '#090d16', border: '1px solid rgba(255,255,255,0.06)', zIndex: 1 }}></div>
            </div>
          </div>
        </section>

        {/* Right Panel: Active Missions Monitor */}
        <section className="dispatch-panel panel-right">
          <div className="panel-header">
            <h3>Active Missions Monitor ({missions.length})</h3>
            <button className="panel-refresh-btn" onClick={fetchActiveMissions} title="Refresh active missions">🔄</button>
          </div>
          <div className="panel-content scrollable">
            {loadingMissions ? (
              <div className="panel-spinner-wrap"><div className="panel-spinner"></div></div>
            ) : missions.length === 0 ? (
              <div className="panel-empty-state">No active dispatch missions.</div>
            ) : (
              <div className="missions-list">
                {missions.map((mission) => {
                  const step = getMissionStatusStep(mission.status);
                  return (
                    <div key={mission.id} className="mission-card">
                      <div className="mission-card-header">
                        <div>
                          <h4 className="mission-title">Mission: {mission.ambulance?.ambulance_number}</h4>
                          <span className="mission-driver-lbl">Driver: {mission.driver?.name}</span>
                          <button 
                            className="track-map-btn"
                            style={{
                              marginTop: '6px',
                              background: activeTrackedMission?.id === mission.id ? '#10b981' : 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '6px',
                              color: '#ffffff',
                              fontSize: '0.72rem',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              width: 'fit-content'
                            }}
                            onClick={() => setActiveTrackedMission(activeTrackedMission?.id === mission.id ? null : mission)}
                          >
                            📍 {activeTrackedMission?.id === mission.id ? 'Tracking Live' : 'Track on Map'}
                          </button>
                        </div>
                        <span className={`status-pill status-${mission.status.toLowerCase()}`}>
                          {mission.status}
                        </span>
                      </div>

                      <div className="mission-card-body">
                        <div className="mission-info-line">
                          <span>Patient: <strong>{mission.emergency_request?.requester_name}</strong></span>
                        </div>
                        <div className="mission-info-line">
                          <span>Emergency: <strong>{mission.emergency_request?.emergency_type}</strong></span>
                        </div>
                        <div className="mission-info-line">
                          <span>Location: 📍 <strong>{mission.emergency_request?.pickup_location}</strong></span>
                        </div>

                        {/* progress stepper */}
                        <div className="mission-stepper">
                          <div className={`step-dot ${step >= 1 ? 'completed' : ''}`} title="Assigned"></div>
                          <div className={`step-line ${step >= 2 ? 'completed' : ''}`}></div>
                          <div className={`step-dot ${step >= 2 ? 'completed' : ''}`} title="En Route"></div>
                          <div className={`step-line ${step >= 3 ? 'completed' : ''}`}></div>
                          <div className={`step-dot ${step >= 3 ? 'completed' : ''}`} title="At Incident"></div>
                          <div className={`step-line ${step >= 4 ? 'completed' : ''}`}></div>
                          <div className={`step-dot ${step >= 4 ? 'completed' : ''}`} title="Patient Onboard"></div>
                          <div className={`step-line ${step >= 5 ? 'completed' : ''}`}></div>
                          <div className={`step-dot ${step >= 5 ? 'completed' : ''}`} title="Hospital Arrival"></div>
                          <div className={`step-line ${step >= 6 ? 'completed' : ''}`}></div>
                          <div className={`step-dot ${step >= 6 ? 'completed' : ''}`} title="Sanitization"></div>
                          <div className={`step-line ${step >= 7 ? 'completed' : ''}`}></div>
                          <div className={`step-dot ${step >= 7 ? 'completed' : ''}`} title="Ready"></div>
                        </div>

                        {/* status step labels */}
                        <div className="step-labels">
                          <span>Assigned</span>
                          <span>En Route</span>
                          <span>At Incident</span>
                          <span>Onboard</span>
                          <span>Hospital</span>
                          <span>Sanitize</span>
                          <span>Ready</span>
                        </div>
                      </div>

                      <div className="mission-actions">
                        {/* transition controls */}
                        {mission.status === 'ASSIGNED' && (
                          <button 
                            className="mission-transition-btn depart-btn"
                            onClick={() => handleTransitionMission(mission.id, 'EN_ROUTE')}
                          >
                            Depart (En Route)
                          </button>
                        )}
                        {mission.status === 'EN_ROUTE' && (
                          <button 
                            className="mission-transition-btn onscene-btn"
                            onClick={() => handleTransitionMission(mission.id, 'AT_INCIDENT')}
                          >
                            Arrived on Scene (At Incident)
                          </button>
                        )}
                        {(mission.status === 'AT_INCIDENT' || mission.status === 'ON_SITE') && (
                          <button 
                            className="mission-transition-btn transport-btn"
                            onClick={() => handleTransitionMission(mission.id, 'PATIENT_ONBOARD')}
                          >
                            Patient Onboard
                          </button>
                        )}
                        {(mission.status === 'PATIENT_ONBOARD' || mission.status === 'TRANSPORTING') && (
                          <button 
                            className="mission-transition-btn hospital-btn"
                            onClick={() => handleTransitionMission(mission.id, 'HOSPITAL_ARRIVAL')}
                          >
                            Arrived Hospital (Hospital Arrival)
                          </button>
                        )}
                        {(mission.status === 'HOSPITAL_ARRIVAL' || mission.status === 'ARRIVED_HOSPITAL') && (
                          <button 
                            className="mission-transition-btn sanitize-btn"
                            onClick={() => handleTransitionMission(mission.id, 'SANITIZATION')}
                          >
                            Begin Sanitization
                          </button>
                        )}
                        {mission.status === 'SANITIZATION' && (
                          <button 
                            className="mission-transition-btn ready-btn"
                            onClick={() => handleTransitionMission(mission.id, 'READY')}
                          >
                            Sanitization Complete (Ready)
                          </button>
                        )}
                        {mission.status === 'READY' && (
                          <button 
                            className="mission-transition-btn complete-btn"
                            onClick={() => handleTransitionMission(mission.id, 'COMPLETED')}
                          >
                            Complete Mission (Available)
                          </button>
                        )}

                        <button 
                          className="mission-cancel-btn"
                          onClick={() => {
                            if(window.confirm("Abort mission? Vehicle will be freed and incident returned to pending queue.")) {
                              handleTransitionMission(mission.id, 'CANCELLED');
                            }
                          }}
                        >
                          Abort Mission
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default DispatchConsole;
