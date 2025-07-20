import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import { API_ENDPOINTS } from '../utils/config';

export default function AdminLogin() {
  const { setCurrentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else if (data.user) {
      // Fetch admin profile from backend
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const token = session?.access_token;
      const res = await fetch(API_ENDPOINTS.ADMIN_PROFILE, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const adminData = await res.json();
        adminData.is_admin = true;
        adminData.name = adminData.full_name;
        setCurrentUser(adminData);
        localStorage.setItem('currentUser', JSON.stringify(adminData));
        if (adminData.onboarding_complete) {
          navigate('/admin/dashboard');
        } else {
          navigate('/admin/onboarding');
        }
      } else {
        navigate('/admin/onboarding');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Login</h2>
          <p className="text-gray-600">
            Sign in to access the CasaLinger admin dashboard.
          </p>
        </div>
        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <PasswordInput
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            label="Password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
} 