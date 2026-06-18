import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={spinnerContainerStyle}>
        <div style={spinnerStyle}></div>
        <p style={loadingTextStyle}>Securing session, please wait...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page and remember original destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Handle checking of role name (either nested object role.name or plain role string)
  const userRole = typeof user.role === 'object' ? user.role?.name : user.role;

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return (
      <div style={accessDeniedContainerStyle}>
        <div style={accessDeniedCardStyle}>
          <div style={errorIconStyle}>⚠️</div>
          <h2 style={errorTitleStyle}>Access Denied</h2>
          <p style={errorMessageStyle}>
            Your role (<strong>{userRole || 'NONE'}</strong>) does not have permission to access this resource.
          </p>
          <button style={backButtonStyle} onClick={() => window.history.back()}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return children;
};

// --- Modern Glassmorphism Styles (Inline CSS for maximum portability & reliability) ---

const spinnerContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  backgroundColor: '#0a0b10',
  fontFamily: "'Inter', sans-serif",
  color: '#ffffff',
};

const spinnerStyle = {
  width: '50px',
  height: '50px',
  border: '3px solid rgba(255, 255, 255, 0.1)',
  borderTop: '3px solid #6366f1',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

// Add standard keyframes for spin directly inline via standard document styles if needed,
// but for standard visual we'll bundle it beautifully in index.css as well.
const loadingTextStyle = {
  marginTop: '20px',
  fontSize: '1rem',
  color: '#94a3b8',
  letterSpacing: '0.05em',
};

const accessDeniedContainerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  backgroundColor: '#0a0b10',
  fontFamily: "'Inter', sans-serif",
};

const accessDeniedCardStyle = {
  padding: '40px',
  borderRadius: '16px',
  background: 'rgba(30, 41, 59, 0.7)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  textAlign: 'center',
  maxWidth: '400px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
};

const errorIconStyle = {
  fontSize: '3rem',
  marginBottom: '15px',
};

const errorTitleStyle = {
  color: '#ef4444',
  fontSize: '1.75rem',
  fontWeight: '700',
  marginBottom: '10px',
};

const errorMessageStyle = {
  color: '#94a3b8',
  fontSize: '1rem',
  lineHeight: '1.5',
  marginBottom: '25px',
};

const backButtonStyle = {
  padding: '12px 24px',
  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '0.95rem',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s',
  boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.4)',
};

export default ProtectedRoute;
