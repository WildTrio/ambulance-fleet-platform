import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { Toaster } from 'react-hot-toast';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Route */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Role Protected Routes Example (for subsequent development phases) */}
          {/* 
          <Route 
            path="/admin-only" 
            element={
              <ProtectedRoute allowedRoles={['HOSPITAL_ADMINISTRATOR']}>
                <div>Admin Dashboard Component</div>
              </ProtectedRoute>
            } 
          />
          */}

          {/* Redirect all unmatched routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 5000,
          style: {
            background: '#0d1527',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            fontSize: '0.9rem',
            zIndex: 99999
          }
        }} 
      />
    </AuthProvider>
  );
}

export default App;
