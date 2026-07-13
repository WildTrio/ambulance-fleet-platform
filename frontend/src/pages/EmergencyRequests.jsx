import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './EmergencyRequests.css';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const EmergencyRequests = () => {
  const { user } = useAuth();
  const userRole = typeof user?.role === 'object' ? user.role?.name : user?.role;
  const isCitizen = userRole === 'EMERGENCY_REQUESTOR';
  const isStaff = ['HOSPITAL_ADMINISTRATOR', 'DISPATCHER'].includes(userRole);

  // Lists & Loading state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [requesterName, setRequesterName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emergencyType, setEmergencyType] = useState('Cardiac Arrest');
  const [customEmergencyType, setCustomEmergencyType] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  // Geocoding states
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [geocodeSuccess, setGeocodeSuccess] = useState('');

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Search/Filters states
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRequests = async () => {
    try {
      let url = '/emergency-requests/';
      const params = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (priorityFilter) params.push(`priority=${priorityFilter}`);
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }
      const response = await api.get(url);
      setRequests(response.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch emergency requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Auto-polling for real-time queue experience (every 10 seconds)
    const interval = setInterval(fetchRequests, 10000);
    return () => clearInterval(interval);
  }, [statusFilter, priorityFilter]);

  const handleGeocode = async () => {
    if (!pickupLocation) {
      setGeocodeError('Please enter a address first.');
      return;
    }
    setGeocoding(true);
    setGeocodeError('');
    setGeocodeSuccess('');
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickupLocation)}`,
        {
          headers: {
            'User-Agent': 'Lifeline-Dispatch-App/1.0',
          },
        }
      );
      if (!response.ok) {
        throw new Error('Geocoding service error');
      }
      const data = await response.json();
      if (data && data.length > 0) {
        const firstResult = data[0];
        setLatitude(parseFloat(firstResult.lat).toFixed(6));
        setLongitude(parseFloat(firstResult.lon).toFixed(6));
        setGeocodeSuccess(
          `Coordinates located! (${parseFloat(firstResult.lat).toFixed(4)}, ${parseFloat(firstResult.lon).toFixed(4)})`
        );
      } else {
        setGeocodeError('Address not found. Please enter coordinates manually.');
      }
    } catch (err) {
      setGeocodeError('Failed to retrieve coordinates. Please enter manually.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    const finalEmergencyType = emergencyType === 'Other' ? customEmergencyType : emergencyType;
    if (!finalEmergencyType) {
      setSubmitError('Emergency type is required.');
      setSubmitting(false);
      return;
    }

    const contactRegex = /^[\d\s\-\(\)\+]+$/;
    if (!contactRegex.test(contactNumber)) {
      setSubmitError('Contact number contains invalid characters.');
      setSubmitting(false);
      return;
    }
    const cleanedContact = contactNumber.replace(/\D/g, '');
    if (cleanedContact.length !== 10) {
      setSubmitError('Contact number must contain exactly 10 digits.');
      setSubmitting(false);
      return;
    }

    const payload = {
      requester_name: requesterName,
      contact_number: contactNumber,
      emergency_type: finalEmergencyType,
      pickup_location: pickupLocation,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    };

    if (isStaff) {
      payload.priority = priority;
    }

    try {
      await api.post('/emergency-requests/', payload);
      setSubmitSuccess('Emergency request registered successfully!');
      toast.success('Emergency request registered successfully!');
      // Reset form
      setRequesterName('');
      setContactNumber('');
      setEmergencyType('Cardiac Arrest');
      setCustomEmergencyType('');
      setPickupLocation('');
      setLatitude('');
      setLongitude('');
      setGeocodeSuccess('');
      setGeocodeError('');
      fetchRequests();
    } catch (err) {
      console.error(err);
      if (err.response?.data) {
        const data = err.response.data;
        if (typeof data === 'object') {
          const firstKey = Object.keys(data)[0];
          setSubmitError(`${firstKey}: ${data[firstKey][0]}`);
        } else {
          setSubmitError('Failed to submit emergency request.');
        }
      } else {
        setSubmitError('Failed to connect to the server.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this emergency request?')) return;
    try {
      await api.patch(`/emergency-requests/${id}/`, { status: 'CANCELLED' });
      toast.success('Request cancelled successfully.');
      fetchRequests();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to cancel the request.');
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await api.patch(`/emergency-requests/${id}/`, { status: newStatus });
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      fetchRequests();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to update status.');
    }
  };

  const handleUpdatePriority = async (id, newPriority) => {
    try {
      await api.patch(`/emergency-requests/${id}/`, { priority: newPriority });
      toast.success(`Priority updated to ${newPriority}`);
      fetchRequests();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to update priority.');
    }
  };

  // Filter requests based on search query
  const filteredRequests = requests.filter((req) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      req.requester_name.toLowerCase().includes(query) ||
      req.emergency_type.toLowerCase().includes(query) ||
      req.pickup_location.toLowerCase().includes(query)
    );
  });

  const ongoingRequests = filteredRequests.filter(req => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(req.status));
  const pastRequests = filteredRequests.filter(req => ['COMPLETED', 'CANCELLED'].includes(req.status));

  const renderRequestCard = (req) => {
    return (
      <div key={req.id} className={`request-item-card priority-border-${req.priority.toLowerCase()}`}>
        <div className="request-card-top">
          <span className="req-type">{req.emergency_type}</span>
          <span className={`status-badge status-${req.status.toLowerCase()}`}>
            {req.status}
          </span>
        </div>

        <div className="request-card-body">
          <div className="req-info-row">
            <span className="info-lbl">Requester:</span>
            <span className="info-val">{req.requester_name} ({req.contact_number})</span>
          </div>
          <div className="req-info-row">
            <span className="info-lbl">Location:</span>
            <span className="info-val">{req.pickup_location}</span>
          </div>
          <div className="req-info-row">
            <span className="info-lbl">Coordinates:</span>
            <span className="info-val">({parseFloat(req.latitude).toFixed(4)}, {parseFloat(req.longitude).toFixed(4)})</span>
          </div>
          <div className="req-info-row">
            <span className="info-lbl">Logged At:</span>
            <span className="info-val">{new Date(req.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="request-card-actions">
          {/* Citizen cancellation option */}
          {isCitizen && ['PENDING', 'ASSIGNED'].includes(req.status) && (
            <button
              className="action-cancel-btn"
              onClick={() => handleCancelRequest(req.id)}
            >
              Cancel Request
            </button>
          )}

          {/* Staff controls */}
          {isStaff && !['COMPLETED', 'CANCELLED'].includes(req.status) && (
            <div className="staff-actions-wrapper">
              <div className="action-select-group">
                <label>Status</label>
                <select
                  value={req.status}
                  onChange={(e) => handleUpdateStatus(req.id, e.target.value)}
                  disabled={['ASSIGNED', 'IN_PROGRESS'].includes(req.status)}
                  title={['ASSIGNED', 'IN_PROGRESS'].includes(req.status) ? "This request has an active mission. Update status via the Dispatch Console." : ""}
                >
                  <option value="PENDING">Pending</option>
                  {req.status === 'ASSIGNED' && <option value="ASSIGNED">Assigned</option>}
                  {req.status === 'IN_PROGRESS' && <option value="IN_PROGRESS">In Progress</option>}
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="action-select-group">
                <label>Priority</label>
                <select
                  value={req.priority}
                  onChange={(e) => handleUpdatePriority(req.id, e.target.value)}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
          )}

          {/* Closed requests state */}
          {['COMPLETED', 'CANCELLED'].includes(req.status) && (
            <span className="closed-request-lbl">
              Closed Case ({req.status})
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="emergency-module-container">
      {/* Grid containing form and list */}
      <div className="emergency-grid">
        {/* Creation Intake Form (Visible to Citizen and Dispatchers/Admin) */}
        {(isCitizen || isStaff) && (
          <section className="emergency-card form-card">
            <h2 className="card-title">
              {isStaff ? '🚨 Emergency Request Intake' : '🚨 Request Emergency Help'}
            </h2>
            <form onSubmit={handleCreateRequest} className="intake-form">
              {submitError && (
                <div className="form-alert alert-error">
                  <span className="alert-icon">⚠️</span>
                  <span>{submitError}</span>
                </div>
              )}
              {submitSuccess && (
                <div className="form-alert alert-success">
                  <span className="alert-icon">✅</span>
                  <span>{submitSuccess}</span>
                </div>
              )}

              <div className="input-group">
                <label>Requester Name</label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                />
              </div>

              <div className="input-group">
                <label>Contact Number</label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g. 555-0199"
                  required
                />
              </div>

              <div className="input-group">
                <label>Emergency Type</label>
                <select
                  value={emergencyType}
                  onChange={(e) => setEmergencyType(e.target.value)}
                  className="type-select"
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

              {emergencyType === 'Other' && (
                <div className="input-group pulse-anim">
                  <label>Specify Emergency Type</label>
                  <input
                    type="text"
                    value={customEmergencyType}
                    onChange={(e) => setCustomEmergencyType(e.target.value)}
                    placeholder="Describe the medical emergency"
                    required
                  />
                </div>
              )}

              <div className="input-group address-group">
                <label>Pickup Location / Address</label>
                <div className="address-input-wrapper">
                  <input
                    type="text"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    placeholder="e.g. 123 Main St, Central City"
                    required
                  />
                  <button
                    type="button"
                    className="locate-btn"
                    onClick={handleGeocode}
                    disabled={geocoding}
                  >
                    {geocoding ? <span className="spinner-mini"></span> : '🔍 Locate'}
                  </button>
                </div>
                {geocodeError && <span className="geocode-msg text-error">{geocodeError}</span>}
                {geocodeSuccess && <span className="geocode-msg text-success">{geocodeSuccess}</span>}
              </div>

              <div className="coordinates-row">
                <div className="input-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 37.7749"
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="e.g. -122.4194"
                    required
                  />
                </div>
              </div>

              {isStaff && (
                <div className="input-group">
                  <label>Assign Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="priority-select">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              )}

              <button type="submit" className="submit-intake-btn" disabled={submitting}>
                {submitting ? <span className="spinner-mini"></span> : isStaff ? 'Log Emergency Request' : 'Call for Ambulance'}
              </button>
            </form>
          </section>
        )}

        {/* List / Queue View (Available to Citizens and Staff) */}
        <section className="emergency-card queue-card">
          <div className="queue-header">
            <h2 className="card-title">
              {isStaff ? '🚨 Active Emergency Queue' : '📋 Your Requests'}
            </h2>
            <button className="refresh-btn" onClick={fetchRequests} title="Refresh Request Queue">
              🔄
            </button>
          </div>

          {isStaff && (
            <div className="queue-controls">
              <input
                type="text"
                placeholder="🔍 Search name, location, medical emergency..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <div className="filters-row">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                  <option value="">All Priorities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
          )}

          {loading ? (
            <div className="loading-wrapper">
              <div className="spinner"></div>
              <span>Fetching requests...</span>
            </div>
          ) : error ? (
            <div className="error-message">
              <span>{error}</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="empty-message">
              <span>No emergency requests found.</span>
            </div>
          ) : (
            <div className="queue-sections-wrapper">
              {/* Ongoing Section */}
              <div className="queue-section">
                <h3 className="section-subtitle">⏳ Ongoing Cases ({ongoingRequests.length})</h3>
                {ongoingRequests.length === 0 ? (
                  <p className="no-requests-msg">No ongoing requests.</p>
                ) : (
                  <div className="requests-list">
                    {ongoingRequests.map((req) => renderRequestCard(req))}
                  </div>
                )}
              </div>

              {/* Past / Completed Section */}
              <div className="queue-section past-cases-section">
                <h3 className="section-subtitle">📁 Past & Closed Cases ({pastRequests.length})</h3>
                {pastRequests.length === 0 ? (
                  <p className="no-requests-msg">No past cases.</p>
                ) : (
                  <div className="requests-list">
                    {pastRequests.map((req) => renderRequestCard(req))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default EmergencyRequests;
