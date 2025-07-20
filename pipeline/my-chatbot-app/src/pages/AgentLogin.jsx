import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import { API_ENDPOINTS } from '../utils/config';

const AgentLogin = () => {
    const navigate = useNavigate();
    const { setCurrentUser } = useContext(AuthContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [showForgot, setShowForgot] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setMessage('');
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        setLoading(false);
        if (error) {
            setError(error.message);
        } else if (data.user) {
            // Fetch agent profile from backend
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;
            const res = await fetch(API_ENDPOINTS.AGENT_PROFILE, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const agentData = await res.json();
                agentData.is_agent = true;
                setCurrentUser(agentData);
                localStorage.setItem('currentUser', JSON.stringify(agentData));
                if (agentData.onboarding_complete) {
                    navigate('/agent/dashboard');
                } else {
                    navigate('/agent/onboarding');
                }
            } else {
                navigate('/agent/onboarding');
            }
        }
    };

    const handleGoogle = async () => {
        setError('');
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/agent/onboarding'
            }
        });
        setLoading(false);
        if (error) setError(error.message);
    };

    const handleForgot = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password?type=agent'
        });
        setLoading(false);
        if (error) {
            setError(error.message);
        } else {
            setMessage('Check your email for password reset instructions.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-blue-50">
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
                <div className="flex justify-center mb-4">
                    <span className="inline-block bg-blue-100 text-blue-700 font-bold text-lg px-6 py-2 rounded-full shadow">Agent</span>
                </div>
                <button
                    onClick={handleGoogle}
                    className="w-full flex items-center justify-center gap-2 bg-blue-50 text-gray-900 font-semibold py-3 rounded-lg mb-4 border border-gray-200 hover:bg-blue-100 transition"
                    disabled={loading}
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                    Continue with Google
                </button>
                <div className="flex items-center my-4">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="mx-3 text-gray-400 text-sm">Or, sign in with your email</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                </div>
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                {message && <p className="text-green-600 text-sm mb-2">{message}</p>}
                {!showForgot ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block font-semibold mb-1">Email</label>
                            <input
                                type="email"
                                className="w-full border rounded p-2"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <PasswordInput
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                        <button
                            type="submit"
                            className="w-full bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition"
                            disabled={loading}
                        >
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleForgot} className="space-y-4">
                        <div>
                            <label className="block font-semibold mb-1">Email</label>
                            <input
                                type="email"
                                className="w-full border rounded p-2"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition"
                            disabled={loading}
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                    </form>
                )}
                <div className="mt-4 text-center">
                    <button
                        className="text-blue-700 font-semibold hover:underline"
                        onClick={() => setShowForgot(!showForgot)}
                        type="button"
                    >
                        {showForgot ? 'Back to Login' : 'Forgot password?'}
                    </button>
                </div>
                <div className="mt-4 text-center">
                    Don't have an account?{' '}
                    <Link to="/agent/register" className="text-blue-700 font-semibold hover:underline">Create account</Link>
                </div>
                <div className="mt-4 text-center text-xs text-gray-400">
                    By signing up, you agree to our{' '}
                    <a href="/terms" className="underline">Terms Of Use</a> and{' '}
                    <a href="/privacy" className="underline">Privacy Policy</a>
                </div>
            </div>
        </div>
    );
};

export default AgentLogin;
