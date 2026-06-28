import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Ambulances.css';

const Ambulances = () => {
  const { user } = useAuth();
  const userRole = typeof user?.role === 'object' ? user.role?.name : user?.role;
  const isWritable = ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER'].includes(userRole);

  const [ambulances, setAmbulances] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [stations, setStations] = useState([]);
  const [drivers, setDrivers] = useState([]);
  
  // Filtering states
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stationFilter, setStationFilter] = useState('');

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Modals visibility states
  const [activeModal, setActiveModal] = useState(null); // 'add', 'edit', 'assign', 'transfer', 'status', 'history'
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [equipmentList, setEquipmentList] = useState([]);
  const [newEquipmentName, setNewEquipmentName] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    ambulance_number: '',
    hospital_id: '',
    station_id: '',
    type: 'Basic Life Support',
    status: 'ACTIVE',
    equipment: [],
  });
  
  const [assignDriverId, setAssignDriverId] = useState('');
  const [transferStationId, setTransferStationId] = useState('');
  const [statusChange, setStatusChange] = useState({
    status: 'ACTIVE',
    remarks: '',
  });

  // Fetch all ambulances and supporting data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build query params
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (stationFilter) params.station_id = stationFilter;

      const [ambRes, hospRes, statRes, equipRes] = await Promise.all([
        api.get('/ambulances/', { params }),
        api.get('/hospitals/'),
        api.get('/stations/'),
        api.get('/equipment/'),
      ]);

      setAmbulances(ambRes.data);
      setHospitals(hospRes.data);
      setStations(statRes.data);
      setEquipmentList(equipRes.data);
      
      // If user has write access, load available drivers
      if (isWritable) {
        const driversRes = await api.get('/drivers/?available=true');
        setDrivers(driversRes.data);
      }
    } catch (err) {
      setError(err.detail || 'Failed to fetch fleet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, typeFilter, stationFilter]);

  const loadDrivers = async () => {
    try {
      const driversRes = await api.get('/drivers/?available=true');
      setDrivers(driversRes.data);
    } catch (err) {
      console.error('Failed to load drivers', err);
    }
  };

  const handleOpenModal = (modalType, ambulance = null) => {
    setSelectedAmbulance(ambulance);
    setActiveModal(modalType);
    setActionSuccess(null);
    setError(null);

    if (ambulance) {
      if (modalType === 'edit') {
        setFormData({
          ambulance_number: ambulance.ambulance_number,
          hospital_id: ambulance.hospital?.id || '',
          station_id: ambulance.station?.id || '',
          type: ambulance.type,
          status: ambulance.status,
          equipment: ambulance.equipment || [],
        });
      } else if (modalType === 'assign') {
        setAssignDriverId(ambulance.active_driver?.id || '');
        loadDrivers();
      } else if (modalType === 'transfer') {
        setTransferStationId(ambulance.station?.id || '');
      } else if (modalType === 'status') {
        setStatusChange({
          status: ambulance.status,
          remarks: '',
        });
      } else if (modalType === 'history') {
        fetchHistory(ambulance.id);
      }
    } else {
      // Reset form for add modal
      setFormData({
        ambulance_number: '',
        hospital_id: hospitals[0]?.id || '',
        station_id: '',
        type: 'Basic Life Support',
        status: 'ACTIVE',
        equipment: [],
      });
    }
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setSelectedAmbulance(null);
  };

  const fetchHistory = async (id) => {
    setHistoryLoading(true);
    try {
      const historyRes = await api.get(`/ambulances/${id}/history/`);
      setHistoryLogs(historyRes.data);
    } catch (err) {
      setError('Failed to fetch operational history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/ambulances/', formData);
      setActionSuccess('Ambulance added successfully!');
      fetchData();
      handleCloseModal();
    } catch (err) {
      if (err.ambulance_number) {
        setError(`Ambulance Number: ${err.ambulance_number[0]}`);
      } else if (err.non_field_errors) {
        setError(err.non_field_errors[0]);
      } else {
        setError('Failed to add ambulance.');
      }
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/ambulances/${selectedAmbulance.id}/`, formData);
      setActionSuccess('Ambulance details updated!');
      fetchData();
      handleCloseModal();
    } catch (err) {
      if (err.ambulance_number) {
        setError(`Ambulance Number: ${err.ambulance_number[0]}`);
      } else if (err.non_field_errors) {
        setError(err.non_field_errors[0]);
      } else {
        setError('Failed to update ambulance.');
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this ambulance?')) return;
    setError(null);
    try {
      await api.delete(`/ambulances/${id}/`);
      setActionSuccess('Ambulance deleted successfully!');
      fetchData();
    } catch (err) {
      setError('Failed to delete ambulance.');
    }
  };

  const handleAssignDriverSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { driver_id: assignDriverId || null };
      await api.post(`/ambulances/${selectedAmbulance.id}/assign-driver/`, payload);
      setActionSuccess('Driver assignment updated!');
      fetchData();
      handleCloseModal();
    } catch (err) {
      setError(err.non_field_errors?.[0] || err.detail || 'Failed to assign driver.');
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/ambulances/${selectedAmbulance.id}/transfer/`, { station_id: transferStationId });
      setActionSuccess('Ambulance transferred successfully!');
      fetchData();
      handleCloseModal();
    } catch (err) {
      setError(err.non_field_errors?.[0] || 'Failed to transfer station.');
    }
  };

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/ambulances/${selectedAmbulance.id}/change-status/`, statusChange);
      setActionSuccess('Ambulance status updated!');
      fetchData();
      handleCloseModal();
    } catch (err) {
      setError(err.non_field_errors?.[0] || err.detail || 'Failed to change status.');
    }
  };

  const handleToggleEquipment = (eqName) => {
    const isSelected = formData.equipment.includes(eqName);
    if (isSelected) {
      setFormData({
        ...formData,
        equipment: formData.equipment.filter(name => name !== eqName)
      });
    } else {
      setFormData({
        ...formData,
        equipment: [...formData.equipment, eqName]
      });
    }
  };

  const handleAddCustomEquipment = (e) => {
    e.preventDefault();
    if (!newEquipmentName || !newEquipmentName.trim()) return;
    const cleanedName = newEquipmentName.trim();
    if (!formData.equipment.includes(cleanedName)) {
      setFormData({
        ...formData,
        equipment: [...formData.equipment, cleanedName]
      });
    }
    // Also add to equipmentList if not already there, so it shows up as a checkbox option temporarily
    if (!equipmentList.some(eq => eq.name.toLowerCase() === cleanedName.toLowerCase())) {
      setEquipmentList([...equipmentList, { id: cleanedName, name: cleanedName }]);
    }
    setNewEquipmentName('');
  };

  // Compute metrics
  const totalAmbulances = ambulances.length;
  const activeCount = ambulances.filter(a => a.status === 'ACTIVE').length;
  const maintenanceCount = ambulances.filter(a => a.status === 'MAINTENANCE').length;
  const inactiveCount = ambulances.filter(a => a.status === 'INACTIVE').length;

  return (
    <div className="ambulances-view">
      {/* Mini Dashboard Stats */}
      <div className="metrics-row">
        <div className="metric-card bg-glass">
          <span className="metric-icon">🚑</span>
          <div className="metric-info">
            <span className="metric-label">Total Fleet</span>
            <span className="metric-value">{totalAmbulances}</span>
          </div>
        </div>
        <div className="metric-card bg-glass active-border">
          <span className="metric-icon active-glow">🟢</span>
          <div className="metric-info">
            <span className="metric-label">Active</span>
            <span className="metric-value">{activeCount}</span>
          </div>
        </div>
        <div className="metric-card bg-glass maintenance-border">
          <span className="metric-icon maintenance-glow">🟠</span>
          <div className="metric-info">
            <span className="metric-label">Maintenance</span>
            <span className="metric-value">{maintenanceCount}</span>
          </div>
        </div>
        <div className="metric-card bg-glass inactive-border">
          <span className="metric-icon">⚫</span>
          <div className="metric-info">
            <span className="metric-label">Inactive</span>
            <span className="metric-value">{inactiveCount}</span>
          </div>
        </div>
      </div>

      {/* Alert Feedbacks */}
      {error && (
        <div className="alert-message alert-error">
          <span className="alert-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="alert-message alert-success">
          <span className="alert-icon">✅</span>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="fleet-controls bg-glass">
        <div className="filters-group">
          <div className="filter-item">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div className="filter-item">
            <label>Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="Basic Life Support">Basic Life Support</option>
              <option value="Advanced Life Support">Advanced Life Support</option>
              <option value="Patient Transport">Patient Transport</option>
            </select>
          </div>
          <div className="filter-item">
            <label>Station</label>
            <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
              <option value="">All Stations</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>{s.station_name}</option>
              ))}
            </select>
          </div>
        </div>

        {isWritable && (
          <button className="btn-primary add-ambulance-btn" onClick={() => handleOpenModal('add')}>
            <span className="btn-icon">+</span> Add Ambulance
          </button>
        )}
      </div>

      {/* Fleet Grid */}
      {loading ? (
        <div className="fleet-loading">
          <span className="spinner-large"></span>
          <p>Loading ambulance fleet assets...</p>
        </div>
      ) : ambulances.length === 0 ? (
        <div className="empty-fleet bg-glass">
          <span className="empty-icon">📂</span>
          <p>No ambulances match your filter criteria.</p>
        </div>
      ) : (
        <div className="fleet-grid">
          {ambulances.map((amb) => (
            <div key={amb.id} className={`ambulance-card bg-glass status-${amb.status.toLowerCase()}`}>
              <div className="card-top">
                <span className="ambulance-no">🚨 {amb.ambulance_number}</span>
                {amb.active_mission ? (
                  <span className="status-badge badge-mission badge-mission-pulse">
                    On Mission ({amb.active_mission.status})
                  </span>
                ) : (
                  <span className={`status-badge badge-${amb.status.toLowerCase()}`}>
                    {amb.status}
                  </span>
                )}
              </div>
              <div className="card-body">
                <div className="card-detail">
                  <span className="detail-label">Type</span>
                  <span className="detail-val">{amb.type}</span>
                </div>
                <div className="card-detail">
                  <span className="detail-label">Hospital</span>
                  <span className="detail-val">{amb.hospital?.hospital_name}</span>
                </div>
                <div className="card-detail">
                  <span className="detail-label">Station</span>
                  <span className="detail-val">{amb.station?.station_name || 'Unassigned'}</span>
                </div>
                <div className="card-detail driver-detail">
                  <span className="detail-label">Assigned Driver</span>
                  <span className="detail-val highlighted-driver">
                    👤 {amb.active_driver?.name || 'No Driver'}
                  </span>
                </div>
                {amb.equipment && amb.equipment.length > 0 && (
                  <div className="card-detail equipment-detail">
                    <span className="detail-label">Equipment</span>
                    <span className="detail-val equipment-tags">
                      {amb.equipment.map(eq => (
                        <span key={eq} className="equip-tag">🔧 {eq}</span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="card-actions">
                <button className="btn-action btn-secondary" onClick={() => handleOpenModal('history', amb)}>
                  History
                </button>
                {isWritable && (
                  <>
                    <button 
                      className="btn-action btn-secondary" 
                      onClick={() => handleOpenModal('assign', amb)}
                      disabled={!!amb.active_mission}
                      title={amb.active_mission ? "Cannot change driver assignment while the ambulance is on an active mission." : ""}
                    >
                      Assign
                    </button>
                    <button 
                      className="btn-action btn-secondary" 
                      onClick={() => handleOpenModal('transfer', amb)}
                      disabled={!!amb.active_mission}
                      title={amb.active_mission ? "Cannot transfer station while the ambulance is on an active mission." : ""}
                    >
                      Transfer
                    </button>
                    <button 
                      className="btn-action btn-secondary" 
                      onClick={() => handleOpenModal('status', amb)}
                      disabled={!!amb.active_mission}
                      title={amb.active_mission ? "Cannot change status while the ambulance is on an active mission." : ""}
                    >
                      Status
                    </button>
                    <button 
                      className="btn-action btn-secondary" 
                      onClick={() => handleOpenModal('edit', amb)}
                      disabled={!!amb.active_mission}
                      title={amb.active_mission ? "Cannot edit details while the ambulance is on an active mission." : ""}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn-action btn-danger" 
                      onClick={() => handleDelete(amb.id)}
                      disabled={!!amb.active_mission}
                      title={amb.active_mission ? "Cannot delete the ambulance while it is on an active mission." : ""}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals Container */}
      {activeModal && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-content bg-glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {activeModal === 'add' && 'Register New Ambulance'}
                {activeModal === 'edit' && `Edit Ambulance - ${selectedAmbulance?.ambulance_number}`}
                {activeModal === 'assign' && `Assign Driver - ${selectedAmbulance?.ambulance_number}`}
                {activeModal === 'transfer' && `Transfer Station - ${selectedAmbulance?.ambulance_number}`}
                {activeModal === 'status' && `Change Status - ${selectedAmbulance?.ambulance_number}`}
                {activeModal === 'history' && `Operational History - ${selectedAmbulance?.ambulance_number}`}
              </h2>
              <button className="btn-close" onClick={handleCloseModal}>&times;</button>
            </div>
            
            <div className="modal-body">
              {/* Add & Edit Form */}
              {(activeModal === 'add' || activeModal === 'edit') && (
                <form onSubmit={activeModal === 'add' ? handleAddSubmit : handleEditSubmit} className="modal-form">
                  <div className="form-group">
                    <label>Ambulance Number</label>
                    <input
                      type="text"
                      value={formData.ambulance_number}
                      onChange={(e) => setFormData({ ...formData, ambulance_number: e.target.value })}
                      placeholder="e.g. AMB-001"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Associated Hospital</label>
                    <select
                      value={formData.hospital_id}
                      onChange={(e) => setFormData({ ...formData, hospital_id: e.target.value })}
                      required
                    >
                      <option value="">Select Hospital</option>
                      {hospitals.map(h => (
                        <option key={h.id} value={h.id}>{h.hospital_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assigned Station</label>
                    <select
                      value={formData.station_id}
                      onChange={(e) => setFormData({ ...formData, station_id: e.target.value })}
                    >
                      <option value="">None (Unassigned)</option>
                      {stations
                        .filter(s => !formData.hospital_id || s.hospital === formData.hospital_id)
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.station_name}</option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Ambulance Type</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      required
                    >
                      <option value="Basic Life Support">Basic Life Support</option>
                      <option value="Advanced Life Support">Advanced Life Support</option>
                      <option value="Patient Transport">Patient Transport</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Medical Equipment</label>
                    <div className="equipment-checkboxes-grid">
                      {equipmentList.map(eq => (
                        <label key={eq.id} className="checkbox-label equipment-checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.equipment.includes(eq.name)}
                            onChange={() => handleToggleEquipment(eq.name)}
                          />
                          {eq.name}
                        </label>
                      ))}
                    </div>
                    
                    <div className="add-custom-equipment-row">
                      <input
                        type="text"
                        placeholder="Add new equipment type..."
                        value={newEquipmentName}
                        onChange={(e) => setNewEquipmentName(e.target.value)}
                        className="custom-eq-input"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomEquipment}
                        className="btn-secondary btn-small"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <div className="form-actions-row">
                    <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                    <button type="submit" className="btn-submit">
                      {activeModal === 'add' ? 'Add Ambulance' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              {/* Assign Driver Form */}
              {activeModal === 'assign' && (
                <form onSubmit={handleAssignDriverSubmit} className="modal-form">
                  <div className="form-group">
                    <label>Choose Driver</label>
                    <select
                      value={assignDriverId}
                      onChange={(e) => setAssignDriverId(e.target.value)}
                    >
                      <option value="">-- No Driver (Unassign Current) --</option>
                      {selectedAmbulance?.active_driver && (
                        <option value={selectedAmbulance.active_driver.id}>
                          {selectedAmbulance.active_driver.name} (Current)
                        </option>
                      )}
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.license_number})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions-row">
                    <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                    <button type="submit" className="btn-submit">Assign Driver</button>
                  </div>
                </form>
              )}

              {/* Transfer Station Form */}
              {activeModal === 'transfer' && (
                <form onSubmit={handleTransferSubmit} className="modal-form">
                  <div className="form-group">
                    <label>Choose Destination Station</label>
                    <select
                      value={transferStationId}
                      onChange={(e) => setTransferStationId(e.target.value)}
                      required
                    >
                      <option value="">Select Station</option>
                      {stations.map(s => (
                        <option key={s.id} value={s.id}>{s.station_name} - {s.hospital?.hospital_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions-row">
                    <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                    <button type="submit" className="btn-submit">Transfer Station</button>
                  </div>
                </form>
              )}

              {/* Change Status Form */}
              {activeModal === 'status' && (
                <form onSubmit={handleStatusSubmit} className="modal-form">
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={statusChange.status}
                      onChange={(e) => setStatusChange({ ...statusChange, status: e.target.value })}
                      required
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Remarks / Reason</label>
                    <textarea
                      value={statusChange.remarks}
                      onChange={(e) => setStatusChange({ ...statusChange, remarks: e.target.value })}
                      placeholder="Provide reasoning for this status transition..."
                      rows="3"
                    ></textarea>
                  </div>
                  <div className="form-actions-row">
                    <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                    <button type="submit" className="btn-submit">Change Status</button>
                  </div>
                </form>
              )}

              {/* History Timeline */}
              {activeModal === 'history' && (
                <div className="timeline-container">
                  {historyLoading ? (
                    <div className="timeline-loading">
                      <span className="spinner-mini"></span> Loading logs...
                    </div>
                  ) : historyLogs.length === 0 ? (
                    <p className="no-timeline">No history recorded for this ambulance yet.</p>
                  ) : (
                    <div className="timeline">
                      {historyLogs.map((log) => (
                        <div key={log.id} className="timeline-item">
                          <div className="timeline-marker"></div>
                          <div className="timeline-content bg-glass">
                            <span className="timeline-date">
                              {new Date(log.changed_at).toLocaleString()}
                            </span>
                            <h4 className="timeline-title">
                              {log.event_type.replace('_', ' ')}
                            </h4>
                            <p className="timeline-values">
                              {log.old_value ? (
                                <>
                                  <span className="old-val">{log.old_value}</span> &rarr;{' '}
                                </>
                              ) : null}
                              <span className="new-val">{log.new_value || 'None'}</span>
                            </p>
                            {log.remarks && <p className="timeline-remarks">"{log.remarks}"</p>}
                            <span className="timeline-author">By: {log.changed_by}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ambulances;
