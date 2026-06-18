import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect target after login
  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err.non_field_errors) {
        setError(err.non_field_errors[0]);
      } else if (err.detail) {
        setError(err.detail);
      } else if (typeof err === 'object') {
        const firstErrorKey = Object.keys(err)[0];
        setError(`${firstErrorKey}: ${err[firstErrorKey][0]}`);
      } else {
        setError('Invalid credentials or server connection failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="background-decor">
        <div className="glow-sphere sphere-1"></div>
        <div className="glow-sphere sphere-2"></div>
      </div>

      <div className="login-card">
        <div className="brand-header">
          <span className="brand-icon">🚨</span>
          <h1 className="brand-title">LIFELINE DISPATCH</h1>
          <p className="brand-subtitle">Emergency Fleet Management & Dispatch</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠️</span>
              <span className="error-message">{error}</span>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? <span className="spinner-mini"></span> : 'Secure Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>Protected by end-to-end audit logging & role-based access control.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
