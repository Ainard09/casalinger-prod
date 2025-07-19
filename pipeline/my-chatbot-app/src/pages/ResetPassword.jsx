import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isValidReset, setIsValidReset] = useState(false);

    // Password strength calculation
    const getPasswordStrength = (password) => {
        if (!password) return { strength: 0, label: '', color: '' };
        
        let strength = 0;
        if (password.length >= 6) strength += 1;
        if (password.length >= 8) strength += 1;
        if (/[a-z]/.test(password)) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/\d/.test(password)) strength += 1;
        if (/[^A-Za-z0-9]/.test(password)) strength += 1;
        
        const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
        const colors = ['text-red-500', 'text-orange-500', 'text-yellow-500', 'text-blue-500', 'text-green-500', 'text-green-600'];
        
        return {
            strength: Math.min(strength, 5),
            label: labels[Math.min(strength, 5)],
            color: colors[Math.min(strength, 5)]
        };
    };

    const passwordStrength = getPasswordStrength(newPassword);

    useEffect(() => {
        // Listen for auth state changes, specifically PASSWORD_RECOVERY events
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state change:', event, session);
            if (event === 'PASSWORD_RECOVERY') {
                setIsValidReset(true);
                setMessage('Please enter your new password.');
            }
        });

        // Check if we have the necessary parameters for password reset
        const accessToken = searchParams.get('access_token');
        const refreshToken = searchParams.get('refresh_token');
        const type = searchParams.get('type');

        if (accessToken && refreshToken && type === 'recovery') {
            // Set the session with the tokens from the reset link
            const { error } = supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });

            if (error) {
                setError('Invalid or expired reset link. Please request a new password reset.');
            } else {
                setIsValidReset(true);
                setMessage('Please enter your new password.');
            }
        } else if (!accessToken && !refreshToken) {
            // No tokens in URL, but we might still be in a recovery state
            // Check if we have a valid session
            const checkSession = async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    setIsValidReset(true);
                    setMessage('Please enter your new password.');
                } else {
                    setError('Invalid reset link. Please request a new password reset.');
                }
            };
            checkSession();
        } else {
            setError('Invalid reset link. Please request a new password reset.');
        }

        // Cleanup subscription
        return () => subscription.unsubscribe();
    }, [searchParams]);

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        // Validate passwords
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long.');
            setLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            setLoading(false);
            return;
        }

        // Additional password strength validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
        if (!passwordRegex.test(newPassword)) {
            setError('Password must contain at least one uppercase letter, one lowercase letter, and one number.');
            setLoading(false);
            return;
        }

        try {
            // Update the user's password
            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                setError(error.message);
            } else {
                setMessage('Password updated successfully! Redirecting to login...');
                // Redirect to login after a short delay
                setTimeout(() => {
                    const userType = searchParams.get('type');
                    if (userType === 'agent') {
                        navigate('/agent/login');
                    } else {
                        navigate('/login');
                    }
                }, 2000);
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
            console.error('Password reset error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isValidReset) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="w-full max-w-lg bg-white p-8 rounded-xl shadow-lg">
                    <h2 className="text-2xl font-bold mb-6 text-center text-blue-700">Password Reset</h2>
                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                    <div className="text-center">
                        <p className="text-gray-600 mb-4">
                            Please check your email for a valid password reset link.
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="text-blue-600 hover:underline"
                        >
                            Back to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-lg bg-white p-8 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold mb-6 text-center text-blue-700">Reset Password</h2>
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                {message && <p className="text-green-600 text-sm mb-4">{message}</p>}
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                        <input
                            type="password"
                            placeholder="New Password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full border rounded p-2"
                            required
                            minLength={6}
                        />
                        {newPassword && (
                            <div className="mt-1">
                                <div className="flex items-center space-x-2">
                                    <div className="flex space-x-1">
                                        {[1, 2, 3, 4, 5].map((level) => (
                                            <div
                                                key={level}
                                                className={`h-1 w-8 rounded ${
                                                    level <= passwordStrength.strength
                                                        ? passwordStrength.color.replace('text-', 'bg-')
                                                        : 'bg-gray-200'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <span className={`text-xs ${passwordStrength.color}`}>
                                        {passwordStrength.label}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    <input
                        type="password"
                        placeholder="Confirm New Password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full border rounded p-2"
                        required
                        minLength={6}
                    />
                    <button
                        type="submit"
                        className="w-full bg-blue-700 text-white py-2 rounded hover:bg-blue-800 transition"
                        disabled={loading}
                    >
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </form>
                <div className="mt-4 text-center">
                    <button
                        onClick={() => navigate('/login')}
                        className="text-blue-600 hover:underline"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword; 