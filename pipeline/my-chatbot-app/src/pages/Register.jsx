import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import PasswordInput from '../components/PasswordInput';

const Register = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Remove auto-redirect on mount. Always show the register form.
    // Optionally clear any lingering user context/localStorage
    // localStorage.removeItem('currentUser');

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        setMessage('');
        try {
            // First check if user already exists in our database
            const checkResponse = await fetch('http://127.0.0.1:5000/api/check-user-exists', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                if (checkData.exists) {
                    setError('User already exists. Please log in.');
                    setLoading(false);
                    return;
                }
            }
            // Register with Supabase
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: 'http://localhost:5173/user/onboarding'
                }
            });
            if (error) {
                if (error.message.toLowerCase().includes('already registered') ||
                    error.message.toLowerCase().includes('user already exists') ||
                    error.message.toLowerCase().includes('already been registered') ||
                    error.message.toLowerCase().includes('email already registered')) {
                    setError('User already exists. Please log in.');
                } else {
                    setError(error.message);
                }
            } else {
                setMessage('Check your email to verify your account.');
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError('');
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/user/onboarding'
            }
        });
        setLoading(false);
        if (error) setError(error.message);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-blue-50">
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
                <div className="flex justify-center mb-4">
                    <span className="inline-block bg-blue-100 text-blue-700 font-bold text-lg px-6 py-2 rounded-full shadow">Renter</span>
                </div>
                <button
                    onClick={handleGoogle}
                    className="w-full flex items-center justify-center gap-2 bg-blue-50 text-gray-900 font-semibold py-3 rounded-lg mb-4 border border-gray-200 hover:bg-blue-100 transition text-base focus:outline-none focus:ring-0 touch-manipulation select-none"
                    disabled={loading}
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                    Continue with Google
                </button>
                <div className="flex items-center my-4">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="mx-3 text-gray-400 text-sm">Or, sign up with your email</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                </div>
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                {message && <p className="text-green-600 text-sm mb-2">{message}</p>}
                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block font-semibold mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full border rounded p-2 text-[16px] appearance-none bg-white"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>
                    <PasswordInput
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                    />
                    <button
                        type="submit"
                        className="w-full bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition text-[16px] appearance-none focus:outline-none focus:ring-0 touch-manipulation select-none"
                        disabled={loading}
                    >
                        {loading ? 'Registering...' : 'Sign up'}
                    </button>
                </form>
                <div className="mt-4 text-center">
                    Already have an account?{' '}
                    <Link to="/login" className="text-blue-700 font-semibold hover:underline">Sign in</Link>
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

export default Register;
