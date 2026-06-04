// views/LoginPage.tsx — Login + Clinic Registration
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import apiClient from '../utils/api';

interface LoginPageProps { isRegister?: boolean; }

const LoginPage: React.FC<LoginPageProps> = ({ isRegister = false }) => {
  const { login }      = useAuthStore();
  const navigate       = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Login form
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Register extras
  const [clinicName, setClinicName] = useState('');
  const [subdomain, setSubdomain]   = useState('');
  const [adminName, setAdminName]   = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await apiClient.post('/auth/register', { clinicName, subdomain, adminName, email, password });
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100
                    flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🐾</div>
          <h1 className="text-3xl font-bold text-blue-700">VetCare</h1>
          <p className="text-slate-500 mt-1">Clinic Management System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">
            {isRegister ? 'Register your clinic' : 'Sign in to your clinic'}
          </h2>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
              {error}
            </div>
          )}

          <form onSubmit={isRegister ? handleRegister : handleLogin} className="space-y-4">
            {isRegister && (
              <>
                <Field label="Clinic Name" value={clinicName} onChange={setClinicName}
                  placeholder="ABC Animal Clinic" required />
                <Field label="Subdomain" value={subdomain} onChange={setSubdomain}
                  placeholder="abc-clinic" required
                  hint="Your URL: abc-clinic.vetcare.app" />
                <Field label="Your Name" value={adminName} onChange={setAdminName}
                  placeholder="Dr. Somchai" required />
              </>
            )}
            <Field label="Email" value={email} onChange={setEmail}
              type="email" placeholder="doctor@clinic.com" required />
            <Field label="Password" value={password} onChange={setPassword}
              type="password" placeholder="••••••••" required />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-semibold py-4 rounded-2xl
                         min-h-[56px] text-base hover:bg-blue-700 active:scale-[0.98]
                         transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? '...' : isRegister ? 'Create Clinic Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {isRegister ? (
              <span>Already have an account? <a href="/login" className="text-blue-600 font-medium">Sign in</a></span>
            ) : (
              <span>New clinic? <a href="/register" className="text-blue-600 font-medium">Register free</a></span>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          🔒 Your data is encrypted and isolated per clinic
        </p>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; hint?: string;
}
const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text', placeholder, required, hint }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} required={required}
      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-base
                 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[48px]"
    />
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
);

export default LoginPage;
