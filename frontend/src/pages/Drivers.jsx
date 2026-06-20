import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Drivers.css';

const Drivers = () => {
  const { user } = useAuth();
  const userRole = typeof user?.role === 'object' ? user.role?.name : user?.role;
  const isWritable = ['HOSPITAL_ADMINISTRATOR', 'FLEET_MANAGER'].includes(userRole);

  const [drivers, setDrivers] = useState([]);
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  
  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Modals visibility states
  const [activeModal, setActiveModal] = useState(null); // 'add', 'edit', 'shifts', 'certifications'
  const [selectedDriver, setSelectedDriver] = useState(null);

  // Shifts and Certifications states
  const [shifts, setShifts] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form states - Driver
  const [driverForm, setDriverForm] = useState({
    name: '',
    email: '',
    password: '',
    contact: '',
    license_number: '',
    availability: true,
  });

  // Form states - Shift
  const [shiftForm, setShiftForm] = useState({
    id: null, // null for add, value for edit
    start_time: '',
    end_time: '',
  });

  // Form states - Certification
  const [certForm, setCertForm] = useState({
    id: null,
    name: '',
    certificate_number: '',
    issuing_authority: '',
    issue_date: '',
    expiry_date: '',
  });

  // Toggle shift & cert form visibility inside detail modals
  const [showShiftAdd, setShowShiftAdd] = useState(false);
  const [showCertAdd, setShowCertAdd] = useState(false);

  const fetchDrivers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (availabilityFilter) {
        params.available = availabilityFilter;
      }
      const response = await api.get('/drivers/', { params });
      setDrivers(response.data);
    } catch (err) {
      setError(err.detail || 'Failed to fetch driver data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [availabilityFilter]);

  const handleOpenModal = (modalType, driver = null) => {
    setSelectedDriver(driver);
    setActiveModal(modalType);
    setActionSuccess(null);
    setError(null);
    setShowShiftAdd(false);
    setShowCertAdd(false);

    if (driver) {
      if (modalType === 'edit') {
        setDriverForm({
          name: driver.name,
          email: driver.email,
          password: '',
          contact: driver.contact,
          license_number: driver.license_number,
          availability: driver.availability,
        });
      } else if (modalType === 'shifts') {
        fetchShifts(driver.id);
        resetShiftForm();
      } else if (modalType === 'certifications') {
        fetchCertifications(driver.id);
        resetCertForm();
      }
    } else {
      setDriverForm({
        name: '',
        email: '',
        password: '',
        contact: '',
        license_number: '',
        availability: true,
      });
    }
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    setSelectedDriver(null);
  };

  // SHIFTS
  const fetchShifts = async (driverId) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/shifts/?driver_id=${driverId}`);
      setShifts(res.data);
    } catch (err) {
      setError('Failed to fetch shifts.');
    } finally {
      setDetailLoading(false);
    }
  };

  const resetShiftForm = () => {
    setShiftForm({
      id: null,
      start_time: '',
      end_time: '',
    });
    setShowShiftAdd(false);
  };

  const handleShiftSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        driver: selectedDriver.id,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
      };

      if (shiftForm.id) {
        await api.patch(`/shifts/${shiftForm.id}/`, payload);
        setActionSuccess('Shift updated successfully!');
      } else {
        await api.post('/shifts/', payload);
        setActionSuccess('Shift scheduled successfully!');
      }
      fetchShifts(selectedDriver.id);
      resetShiftForm();
    } catch (err) {
      setError(err.non_field_errors?.[0] || 'Validation error on shift details.');
    }
  };

  const handleEditShiftClick = (shift) => {
    // Format datetimes to match datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDt = (dtStr) => {
      if (!dtStr) return '';
      const d = new Date(dtStr);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setShiftForm({
      id: shift.id,
      start_time: formatDt(shift.start_time),
      end_time: formatDt(shift.end_time),
    });
    setShowShiftAdd(true);
  };

  const handleDeleteShift = async (id) => {
    if (!window.confirm('Are you sure you want to delete this shift?')) return;
    setError(null);
    try {
      await api.delete(`/shifts/${id}/`);
      setActionSuccess('Shift cancelled.');
      fetchShifts(selectedDriver.id);
    } catch (err) {
      setError('Failed to delete shift.');
    }
  };

  // CERTIFICATIONS
  const fetchCertifications = async (driverId) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/certifications/?driver_id=${driverId}`);
      setCertifications(res.data);
    } catch (err) {
      setError('Failed to fetch certifications.');
    } finally {
      setDetailLoading(false);
    }
  };

  const resetCertForm = () => {
    setCertForm({
      id: null,
      name: '',
      certificate_number: '',
      issuing_authority: '',
      issue_date: '',
      expiry_date: '',
    });
    setShowCertAdd(false);
  };

  const handleCertSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        driver: selectedDriver.id,
        name: certForm.name,
        certificate_number: certForm.certificate_number,
        issuing_authority: certForm.issuing_authority,
        issue_date: certForm.issue_date,
        expiry_date: certForm.expiry_date,
      };

      if (certForm.id) {
        await api.patch(`/certifications/${certForm.id}/`, payload);
        setActionSuccess('Certification updated successfully!');
      } else {
        await api.post('/certifications/', payload);
        setActionSuccess('Certification added successfully!');
      }
      fetchCertifications(selectedDriver.id);
      resetCertForm();
    } catch (err) {
      setError(err.non_field_errors?.[0] || 'Validation error on certification details.');
    }
  };

  const handleEditCertClick = (cert) => {
    setCertForm({
      id: cert.id,
      name: cert.name,
      certificate_number: cert.certificate_number,
      issuing_authority: cert.issuing_authority,
      issue_date: cert.issue_date,
      expiry_date: cert.expiry_date,
    });
    setShowCertAdd(true);
  };

  const handleDeleteCert = async (id) => {
    if (!window.confirm('Are you sure you want to delete this certification?')) return;
    setError(null);
    try {
      await api.delete(`/certifications/${id}/`);
      setActionSuccess('Certification removed.');
      fetchCertifications(selectedDriver.id);
    } catch (err) {
      setError('Failed to delete certification.');
    }
  };

  // DRIVER SUBMIT
  const handleDriverSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (activeModal === 'add') {
        await api.post('/drivers/', driverForm);
        setActionSuccess('Driver profile created successfully!');
      } else {
        const payload = { ...driverForm };
        if (!payload.password) delete payload.password; // do not patch blank password
        await api.patch(`/drivers/${selectedDriver.id}/`, payload);
        setActionSuccess('Driver details updated!');
      }
      fetchDrivers();
      handleCloseModal();
    } catch (err) {
      if (err.email) {
        setError(`Email error: ${err.email[0]}`);
      } else if (err.license_number) {
        setError(`License error: ${err.license_number[0]}`);
      } else if (err.contact) {
        setError(`Contact error: ${err.contact[0]}`);
      } else if (err.non_field_errors) {
        setError(err.non_field_errors[0]);
      } else {
        setError('Failed to save driver profile.');
      }
    }
  };

  const handleDeleteDriver = async (id) => {
    if (!window.confirm('Are you sure you want to remove this driver? This deletes their associated user account.')) return;
    setError(null);
    try {
      await api.delete(`/drivers/${id}/`);
      setActionSuccess('Driver account deleted successfully!');
      fetchDrivers();
    } catch (err) {
      setError('Failed to delete driver.');
    }
  };

  // Metrics
  const totalDrivers = drivers.length;
  const availableCount = drivers.filter(d => d.availability).length;
  const unavailableCount = drivers.filter(d => !d.availability).length;

  return (
    <div className="drivers-view">
      {/* Metrics Bar */}
      <div className="metrics-row">
        <div className="metric-card bg-glass">
          <span className="metric-icon">👥</span>
          <div className="metric-info">
            <span className="metric-label">Total Drivers</span>
            <span className="metric-value">{totalDrivers}</span>
          </div>
        </div>
        <div className="metric-card bg-glass active-border">
          <span className="metric-icon active-glow">🟢</span>
          <div className="metric-info">
            <span className="metric-label">Available / On Duty</span>
            <span className="metric-value">{availableCount}</span>
          </div>
        </div>
        <div className="metric-card bg-glass inactive-border">
          <span className="metric-icon">🔴</span>
          <div className="metric-info">
            <span className="metric-label">Off Duty / Unavailable</span>
            <span className="metric-value">{unavailableCount}</span>
          </div>
        </div>
      </div>

      {/* Action Success Feed */}
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

      {/* Filtering Control Bar */}
      <div className="fleet-controls bg-glass">
        <div className="filters-group">
          <div className="filter-item">
            <label>Availability</label>
            <select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)}>
              <option value="">All Drivers</option>
              <option value="true">Available</option>
            </select>
          </div>
        </div>

        {isWritable && (
          <button className="btn-primary add-driver-btn" onClick={() => handleOpenModal('add')}>
            <span className="btn-icon">+</span> Add Driver
          </button>
        )}
      </div>

      {/* Drivers List Grid */}
      {loading ? (
        <div className="fleet-loading">
          <span className="spinner-large"></span>
          <p>Loading active driver profiles...</p>
        </div>
      ) : drivers.length === 0 ? (
        <div className="empty-fleet bg-glass">
          <span className="empty-icon">📂</span>
          <p>No drivers registered in the system matching criteria.</p>
        </div>
      ) : (
        <div className="fleet-grid">
          {drivers.map((drv) => (
            <div key={drv.id} className={`driver-card bg-glass availability-${drv.availability ? 'on' : 'off'}`}>
              <div className="card-top">
                <span className="driver-name">👤 {drv.name}</span>
                <span className={`status-badge badge-${drv.availability ? 'active' : 'inactive'}`}>
                  {drv.availability ? 'Available' : 'Unavailable'}
                </span>
              </div>
              
              <div className="card-body">
                <div className="card-detail">
                  <span className="detail-label">License Number</span>
                  <span className="detail-val">{drv.license_number}</span>
                </div>
                <div className="card-detail">
                  <span className="detail-label">Email Address</span>
                  <span className="detail-val">{drv.email}</span>
                </div>
                <div className="card-detail">
                  <span className="detail-label">Contact</span>
                  <span className="detail-val">{drv.contact}</span>
                </div>
              </div>

              <div className="card-actions">
                <button className="btn-action btn-secondary" onClick={() => handleOpenModal('shifts', drv)}>
                  📅 Shifts
                </button>
                <button className="btn-action btn-secondary" onClick={() => handleOpenModal('certifications', drv)}>
                  📜 Certifications
                </button>
                {isWritable && (
                  <>
                    <button className="btn-action btn-secondary" onClick={() => handleOpenModal('edit', drv)}>
                      Edit
                    </button>
                    <button className="btn-action btn-danger" onClick={() => handleDeleteDriver(drv.id)}>
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
                {activeModal === 'add' && 'Register New Driver Account'}
                {activeModal === 'edit' && `Edit Driver Profile - ${selectedDriver?.name}`}
                {activeModal === 'shifts' && `Manage Schedule - ${selectedDriver?.name}`}
                {activeModal === 'certifications' && `Certifications - ${selectedDriver?.name}`}
              </h2>
              <button className="btn-close" onClick={handleCloseModal}>&times;</button>
            </div>

            <div className="modal-body">
              {/* Add & Edit Driver Profile Form */}
              {(activeModal === 'add' || activeModal === 'edit') && (
                <form onSubmit={handleDriverSubmit} className="modal-form">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={driverForm.name}
                      onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                      placeholder="e.g. John Doe"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={driverForm.email}
                      onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                      placeholder="e.g. driver@hospital.org"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Password {activeModal === 'edit' && '(Leave blank to keep unchanged)'}</label>
                    <input
                      type="password"
                      value={driverForm.password}
                      onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })}
                      placeholder="Enter account password"
                      required={activeModal === 'add'}
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Number</label>
                    <input
                      type="text"
                      value={driverForm.contact}
                      onChange={(e) => setDriverForm({ ...driverForm, contact: e.target.value })}
                      placeholder="e.g. 555-0100"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>License Number</label>
                    <input
                      type="text"
                      value={driverForm.license_number}
                      onChange={(e) => setDriverForm({ ...driverForm, license_number: e.target.value })}
                      placeholder="e.g. DL-12345678"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Availability / Active Status</label>
                    <select
                      value={driverForm.availability ? 'true' : 'false'}
                      onChange={(e) => setDriverForm({ ...driverForm, availability: e.target.value === 'true' })}
                    >
                      <option value="true">Available for Dispatch</option>
                      <option value="false">Off Duty / Unavailable</option>
                    </select>
                  </div>

                  <div className="form-actions-row">
                    <button type="button" className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                    <button type="submit" className="btn-submit">
                      {activeModal === 'add' ? 'Create Account' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              {/* Shift Scheduling Form & List */}
              {activeModal === 'shifts' && (
                <div className="detail-panel">
                  {isWritable && (
                    <div className="panel-actions">
                      <button 
                        className="btn-primary" 
                        onClick={() => {
                          if (showShiftAdd) resetShiftForm();
                          else setShowShiftAdd(true);
                        }}
                      >
                        {showShiftAdd ? 'Close Scheduler' : '+ Schedule New Shift'}
                      </button>
                    </div>
                  )}

                  {showShiftAdd && isWritable && (
                    <form onSubmit={handleShiftSubmit} className="modal-form inline-form bg-glass">
                      <h4>{shiftForm.id ? 'Edit Scheduled Shift' : 'Add New Shift'}</h4>
                      <div className="form-group">
                        <label>Start Datetime</label>
                        <input
                          type="datetime-local"
                          value={shiftForm.start_time}
                          onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>End Datetime</label>
                        <input
                          type="datetime-local"
                          value={shiftForm.end_time}
                          onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-actions-row">
                        <button type="button" className="btn-cancel" onClick={resetShiftForm}>Cancel</button>
                        <button type="submit" className="btn-submit">Save Shift</button>
                      </div>
                    </form>
                  )}

                  <div className="logs-list">
                    <h4>Shift History & Scheduled Blocks</h4>
                    {detailLoading ? (
                      <p className="loading-text">Loading shift calendar...</p>
                    ) : shifts.length === 0 ? (
                      <p className="empty-text">No shifts scheduled for this driver.</p>
                    ) : (
                      <div className="shifts-grid">
                        {shifts.map(s => (
                          <div key={s.id} className="shift-item bg-glass">
                            <div className="shift-dates">
                              <span className="shift-label">Start:</span>
                              <span className="shift-time">{new Date(s.start_time).toLocaleString()}</span>
                              <span className="shift-label">End:</span>
                              <span className="shift-time">{new Date(s.end_time).toLocaleString()}</span>
                            </div>
                            {isWritable && (
                              <div className="shift-actions">
                                <button className="btn-edit-mini" onClick={() => handleEditShiftClick(s)}>✏️</button>
                                <button className="btn-delete-mini" onClick={() => handleDeleteShift(s.id)}>🗑️</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Certifications Management */}
              {activeModal === 'certifications' && (
                <div className="detail-panel">
                  {isWritable && (
                    <div className="panel-actions">
                      <button 
                        className="btn-primary" 
                        onClick={() => {
                          if (showCertAdd) resetCertForm();
                          else setShowCertAdd(true);
                        }}
                      >
                        {showCertAdd ? 'Close Form' : '+ Add Certification'}
                      </button>
                    </div>
                  )}

                  {showCertAdd && isWritable && (
                    <form onSubmit={handleCertSubmit} className="modal-form inline-form bg-glass">
                      <h4>{certForm.id ? 'Edit Certificate' : 'Log New Certificate'}</h4>
                      <div className="form-group">
                        <label>Certification Name</label>
                        <input
                          type="text"
                          value={certForm.name}
                          onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                          placeholder="e.g. ALS / BLS / CPR Certification"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Certificate Code / Number</label>
                        <input
                          type="text"
                          value={certForm.certificate_number}
                          onChange={(e) => setCertForm({ ...certForm, certificate_number: e.target.value })}
                          placeholder="e.g. CERT-9923"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Issuing Authority</label>
                        <input
                          type="text"
                          value={certForm.issuing_authority}
                          onChange={(e) => setCertForm({ ...certForm, issuing_authority: e.target.value })}
                          placeholder="e.g. Red Cross"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Issue Date</label>
                        <input
                          type="date"
                          value={certForm.issue_date}
                          onChange={(e) => setCertForm({ ...certForm, issue_date: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Expiry Date</label>
                        <input
                          type="date"
                          value={certForm.expiry_date}
                          onChange={(e) => setCertForm({ ...certForm, expiry_date: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-actions-row">
                        <button type="button" className="btn-cancel" onClick={resetCertForm}>Cancel</button>
                        <button type="submit" className="btn-submit">Save Certificate</button>
                      </div>
                    </form>
                  )}

                  <div className="logs-list">
                    <h4>Registered Certifications</h4>
                    {detailLoading ? (
                      <p className="loading-text">Loading credentials database...</p>
                    ) : certifications.length === 0 ? (
                      <p className="empty-text">No certifications registered.</p>
                    ) : (
                      <div className="certs-grid">
                        {certifications.map(c => {
                          const isExpired = new Date(c.expiry_date) < new Date();
                          return (
                            <div key={c.id} className={`cert-item bg-glass ${isExpired ? 'expired-border' : 'valid-border'}`}>
                              <div className="cert-top-row">
                                <span className="cert-title">📜 {c.name}</span>
                                <span className={`status-badge badge-${isExpired ? 'inactive' : 'active'}`}>
                                  {isExpired ? 'Expired' : 'Valid'}
                                </span>
                              </div>
                              <div className="cert-body-row">
                                <div><span className="cert-label">Certificate #:</span> <span className="cert-val">{c.certificate_number}</span></div>
                                <div><span className="cert-label">Issued By:</span> <span className="cert-val">{c.issuing_authority}</span></div>
                                <div><span className="cert-label">Valid Period:</span> <span className="cert-val">{c.issue_date} &rarr; {c.expiry_date}</span></div>
                              </div>
                              {isWritable && (
                                <div className="cert-actions">
                                  <button className="btn-edit-mini" onClick={() => handleEditCertClick(c)}>✏️</button>
                                  <button className="btn-delete-mini" onClick={() => handleDeleteCert(c.id)}>🗑️</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Drivers;
