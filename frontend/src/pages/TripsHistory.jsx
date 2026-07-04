import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './TripsHistory.css';

const TripsHistory = () => {
  // Lists
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [ambulances, setAmbulances] = useState([]);

  // Filters state
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedAmbulance, setSelectedAmbulance] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Loading/Error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected Trip for detailed report modal
  const [selectedTrip, setSelectedTrip] = useState(null);

  const fetchFiltersData = async () => {
    try {
      const [driversRes, ambsRes] = await Promise.all([
        api.get('/drivers/'),
        api.get('/ambulances/')
      ]);
      setDrivers(driversRes.data);
      setAmbulances(ambsRes.data);
    } catch (err) {
      console.error("Error fetching filters data:", err);
    }
  };

  const fetchTrips = async () => {
    setLoading(true);
    setError(null);
    try {
      let queryParams = [];
      if (selectedDriver) queryParams.push(`driver_id=${selectedDriver}`);
      if (selectedAmbulance) queryParams.push(`ambulance_id=${selectedAmbulance}`);
      if (selectedStatus) queryParams.push(`status=${selectedStatus}`);
      if (startDate) queryParams.push(`start_date=${startDate}`);
      if (endDate) queryParams.push(`end_date=${endDate}`);

      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const response = await api.get(`/trips/${queryString}`);
      setTrips(response.data);
    } catch (err) {
      console.error("Error fetching trips:", err);
      setError("Failed to load trips history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiltersData();
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [selectedDriver, selectedAmbulance, selectedStatus, startDate, endDate]);

  const handleClearFilters = () => {
    setSelectedDriver('');
    setSelectedAmbulance('');
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
  };

  const completedCount = trips.filter(t => t.status === 'COMPLETED').length;
  const cancelledCount = trips.filter(t => t.status === 'CANCELLED').length;

  const getStatusColorClass = (status) => {
    return status === 'COMPLETED' ? 'badge-ready' : 'badge-sanitization';
  };

  const calculateDuration = (start, end) => {
    if (!start || !end) return '0 mins';
    const diffMs = new Date(end) - new Date(start);
    const diffMins = Math.max(0, Math.round(diffMs / 60000));
    return `${diffMins} mins`;
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="trips-history-container">
      {/* Header section with Stats Cards */}
      <div className="trips-header-grid">
        <div className="stat-card">
          <span className="stat-icon">🗺️</span>
          <div className="stat-info">
            <span className="stat-label">Total Missions Logged</span>
            <h3>{trips.length}</h3>
          </div>
        </div>
        <div className="stat-card completed">
          <span className="stat-icon">✅</span>
          <div className="stat-info">
            <span className="stat-label">Completed Trips</span>
            <h3>{completedCount}</h3>
          </div>
        </div>
        <div className="stat-card cancelled">
          <span className="stat-icon">⚠️</span>
          <div className="stat-info">
            <span className="stat-label">Cancelled Missions</span>
            <h3>{cancelledCount}</h3>
          </div>
        </div>
      </div>

      <div className="trips-content-layout">
        {/* Left Side: Filter Panel */}
        <aside className="filters-panel">
          <div className="panel-header">
            <h3>Filter Logs & Reports</h3>
            <button className="clear-filters-btn" onClick={handleClearFilters}>Clear All</button>
          </div>
          
          <div className="filter-group">
            <label>Driver Assignment</label>
            <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)}>
              <option value="">All Drivers</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.license_number})</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Vehicle Number</label>
            <select value={selectedAmbulance} onChange={(e) => setSelectedAmbulance(e.target.value)}>
              <option value="">All Vehicles</option>
              {ambulances.map(a => (
                <option key={a.id} value={a.id}>{a.ambulance_number} ({a.type})</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Mission Status</label>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="filter-group">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </aside>

        {/* Right Side: Trips Table / List */}
        <section className="trips-results-panel">
          <div className="results-header">
            <h3>Trip Records Archive</h3>
            <button className="refresh-results-btn" onClick={fetchTrips}>🔄 Refresh Logs</button>
          </div>

          <div className="results-table-container">
            {loading ? (
              <div className="spinner-wrap"><div className="panel-spinner"></div></div>
            ) : error ? (
              <div className="error-state">⚠️ {error}</div>
            ) : trips.length === 0 ? (
              <div className="empty-state">No matching trip logs found. Try adjusting filters.</div>
            ) : (
              <table className="trips-table">
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Status</th>
                    <th>Ambulance</th>
                    <th>Driver</th>
                    <th>Date</th>
                    <th>Duration</th>
                    <th>Distance</th>
                    <th>Report Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip) => (
                    <tr key={trip.id} onClick={() => setSelectedTrip(trip)} className="clickable-row">
                      <td><strong>#{trip.id}</strong></td>
                      <td>
                        <span className={`status-pill ${getStatusColorClass(trip.status)}`}>
                          {trip.status}
                        </span>
                      </td>
                      <td>🚑 {trip.ambulance_number || 'N/A'}</td>
                      <td>👤 {trip.driver_name || 'N/A'}</td>
                      <td>{trip.start_time ? new Date(trip.start_time).toLocaleDateString() : 'N/A'}</td>
                      <td>{calculateDuration(trip.start_time, trip.end_time)}</td>
                      <td><strong>{trip.distance_km} km</strong></td>
                      <td className="summary-cell" title={trip.summary}>{trip.summary || 'No summary available.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Modal for detailed Trip Summary Report */}
      {selectedTrip && (
        <div className="trip-modal-overlay" onClick={() => setSelectedTrip(null)}>
          <div className="trip-modal-card" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Ambulance Mission Summary Report</h2>
              <div className="modal-actions">
                <button className="print-report-btn" onClick={handlePrintReport}>🖨️ Print Report</button>
                <button className="close-modal-btn" onClick={() => setSelectedTrip(null)}>✕</button>
              </div>
            </header>

            <div className="modal-body print-section">
              <div className="report-main-status">
                <span className={`status-badge-large ${getStatusColorClass(selectedTrip.status)}`}>
                  Mission {selectedTrip.status}
                </span>
                <span className="report-timestamp">
                  Generated on {new Date().toLocaleString()}
                </span>
              </div>

              <div className="report-info-grid">
                <section className="report-section card-style">
                  <h4>🚑 Vehicle & Driver Info</h4>
                  <div className="report-row">
                    <span className="lbl">Ambulance Number:</span>
                    <span className="val">{selectedTrip.ambulance_number}</span>
                  </div>
                  <div className="report-row">
                    <span className="lbl">Assigned Driver:</span>
                    <span className="val">{selectedTrip.driver_name}</span>
                  </div>
                  <div className="report-row">
                    <span className="lbl">Base Station:</span>
                    <span className="val">{selectedTrip.station_name || 'N/A'}</span>
                  </div>
                </section>

                <section className="report-section card-style">
                  <h4>👤 Patient & Emergency Info</h4>
                  <div className="report-row">
                    <span className="lbl">Emergency Type:</span>
                    <span className="val highlight">{selectedTrip.emergency_type || 'N/A'}</span>
                  </div>
                  <div className="report-row">
                    <span className="lbl">Patient Name:</span>
                    <span className="val">{selectedTrip.patient_name || 'N/A'}</span>
                  </div>
                  <div className="report-row">
                    <span className="lbl">Destination Hospital:</span>
                    <span className="val">{selectedTrip.hospital_name || 'N/A'}</span>
                  </div>
                </section>

                <section className="report-section card-style full-width">
                  <h4>⏱️ Trip Performance Metrics</h4>
                  <div className="metrics-summary-row">
                    <div className="metric-box">
                      <span className="lbl">Total Distance</span>
                      <h3>{selectedTrip.distance_km} km</h3>
                    </div>
                    <div className="metric-box">
                      <span className="lbl">Total Duration</span>
                      <h3>{calculateDuration(selectedTrip.start_time, selectedTrip.end_time)}</h3>
                    </div>
                    <div className="metric-box">
                      <span className="lbl">Depart Time</span>
                      <span>{selectedTrip.start_time ? new Date(selectedTrip.start_time).toLocaleTimeString() : 'N/A'}</span>
                    </div>
                    <div className="metric-box">
                      <span className="lbl">Resolve Time</span>
                      <span>{selectedTrip.end_time ? new Date(selectedTrip.end_time).toLocaleTimeString() : 'N/A'}</span>
                    </div>
                  </div>
                </section>

                <section className="report-section card-style full-width">
                  <h4>📝 Natural Language Narrative</h4>
                  <p className="narrative-text">
                    "{selectedTrip.summary || 'No narrative description generated for this trip.'}"
                  </p>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripsHistory;
