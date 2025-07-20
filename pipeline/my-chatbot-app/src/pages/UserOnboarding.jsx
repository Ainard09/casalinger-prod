import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { AuthContext } from '../context/AuthContext';
import { API_ENDPOINTS } from '../utils/config';

export default function UserOnboarding() {
    const navigate = useNavigate();
    const { setCurrentUser } = useContext(AuthContext);
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // On mount, check for valid session and onboarding status
    useEffect(() => {
        const checkSessionAndOnboarding = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // No session, redirect to login with message
                navigate('/login', { state: { message: 'Please log in to complete your registration.' } });
                return;
            }
            // Check if user already completed onboarding
            const token = session.access_token;
            const res = await fetch(API_ENDPOINTS.USER_PROFILE, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const userData = await res.json();
                if (userData.onboarding_complete) {
                    setCurrentUser(userData);
                    localStorage.setItem('currentUser', JSON.stringify(userData));
                    navigate('/');
                }
            }
        };
        checkSessionAndOnboarding();
    }, [navigate, setCurrentUser]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const response = await fetch(API_ENDPOINTS.USER_ONBOARDING, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fullName }),
            });
            if (response.ok) {
                // Mark onboarding as complete in backend
                const profileRes = await fetch(API_ENDPOINTS.USER_PROFILE, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (profileRes.ok) {
                    const userData = await profileRes.json();
                    setCurrentUser(userData);
                    localStorage.setItem('currentUser', JSON.stringify(userData));
                }
                navigate('/');
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to complete onboarding');
            }
        } catch (err) {
            setError('Failed to complete onboarding');
            console.error('Onboarding error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold mb-6 text-center text-blue-700">Complete Your Profile</h2>
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter your full name"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
                    >
                        {loading ? 'Completing...' : 'Complete Registration'}
                    </button>
                </form>
            </div>
        </div>
    );
} 