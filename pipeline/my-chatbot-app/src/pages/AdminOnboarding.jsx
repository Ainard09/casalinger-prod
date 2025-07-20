import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import { API_ENDPOINTS } from '../utils/config';

export default function AdminOnboarding() {
  const navigate = useNavigate();
  const { setCurrentUser } = useContext(AuthContext);
  const [fullName, setFullName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [role, setRole] = useState('admin');
  const [permissions, setPermissions] = useState([
    'feature_properties',
    'unfeature_properties',
    'manage_users',
    'manage_agents',
    'view_analytics',
  ]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (adminCode !== 'MOJISOLA') {
      setError('Invalid admin code.');
      setLoading(false);
      return;
    }
    try {
      // Get Supabase session token
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const token = session?.access_token;
      // Send onboarding data to backend
      const response = await fetch(API_ENDPOINTS.ADMIN_ONBOARDING, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName,
          role,
          permissions,
          is_active: isActive,
        }),
      });
      if (response.ok) {
        // Refetch admin profile from backend to get latest onboarding_complete flag
        const profileRes = await fetch(API_ENDPOINTS.ADMIN_PROFILE, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (profileRes.ok) {
          const adminData = await profileRes.json();
          adminData.is_admin = true;
          setCurrentUser(adminData);
          localStorage.setItem('currentUser', JSON.stringify(adminData));
        }
      }
      navigate('/admin/login');
    } catch (err) {
      setError('Failed to update profile.');
      console.error('Backend error:', err.errors || err.message || err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded shadow max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Admin Onboarding</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <PasswordInput
            value={adminCode}
            onChange={e => setAdminCode(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            label="Admin Code"
            placeholder="Enter admin code"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Permissions</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {['feature_properties', 'unfeature_properties', 'manage_users', 'manage_agents', 'view_analytics'].map(p => (
                <label key={p} className="flex items-center text-xs">
                  <input
                    type="checkbox"
                    checked={permissions.includes(p)}
                    onChange={e => {
                      if (e.target.checked) setPermissions([...permissions, p]);
                      else setPermissions(permissions.filter(x => x !== p));
                    }}
                    className="mr-1"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Is Active</label>
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="ml-2"
            />
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Complete Onboarding'}
          </button>
        </form>
        <div className="mt-6">
          <h3 className="text-md font-semibold mb-2">Summary Table</h3>
          <table className="w-full text-xs border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1">Field</th>
                <th className="border px-2 py-1">Where to collect/store?</th>
                <th className="border px-2 py-1">How to access?</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border px-2 py-1">name</td><td className="border px-2 py-1">Onboarding form → backend DB</td><td className="border px-2 py-1">backend DB</td></tr>
              <tr><td className="border px-2 py-1">email</td><td className="border px-2 py-1">Clerk SignUp</td><td className="border px-2 py-1">user.emailAddresses[0].email_address</td></tr>
              <tr><td className="border px-2 py-1">password</td><td className="border px-2 py-1">Clerk SignUp</td><td className="border px-2 py-1">Clerk manages</td></tr>
              <tr><td className="border px-2 py-1">role</td><td className="border px-2 py-1">Onboarding form → backend DB</td><td className="border px-2 py-1">backend DB</td></tr>
              <tr><td className="border px-2 py-1">permissions</td><td className="border px-2 py-1">Onboarding form → backend DB</td><td className="border px-2 py-1">backend DB</td></tr>
              <tr><td className="border px-2 py-1">is_active</td><td className="border px-2 py-1">Onboarding form → backend DB</td><td className="border px-2 py-1">backend DB</td></tr>
              <tr><td className="border px-2 py-1">created_at</td><td className="border px-2 py-1">Clerk system field</td><td className="border px-2 py-1">user.createdAt</td></tr>
              <tr><td className="border px-2 py-1">last_login</td><td className="border px-2 py-1">backend DB</td><td className="border px-2 py-1">backend DB</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

