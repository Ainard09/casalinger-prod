import { useEffect, useState, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SessionTimeoutWarning = () => {
    const [showWarning, setShowWarning] = useState(false);
    const warningTimerRef = useRef(null);
    const logoutTimerRef = useRef(null);
    const { setCurrentUser } = useContext(AuthContext);
    const navigate = useNavigate();

    // Helper to clear both timers
    const clearTimers = () => {
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };

    // Start timers for warning and logout
    const startTimers = () => {
        clearTimers();
        // Show warning at 25 min, logout at 30 min
        warningTimerRef.current = setTimeout(() => setShowWarning(true), 25 * 60 * 1000);
        logoutTimerRef.current = setTimeout(() => {
            setCurrentUser(null);
            localStorage.removeItem('currentUser');
            // Check if user is agent (from localStorage or context)
            let user = null;
            try {
                user = JSON.parse(localStorage.getItem('currentUser'));
            } catch {}
            if (user && user.is_agent) {
                navigate('/agent/login');
            } else {
                navigate('/login');
            }
        }, 30 * 60 * 1000);
    };

    // Reset timers and hide warning
    const stayLoggedIn = () => {
        setShowWarning(false);
        startTimers();
    };

    useEffect(() => {
        startTimers();

        // Optionally, reset timers on user activity
        const activityHandler = () => {
            setShowWarning(false);
            startTimers();
        };
        window.addEventListener('mousemove', activityHandler);
        window.addEventListener('keydown', activityHandler);

        return () => {
            clearTimers();
            window.removeEventListener('mousemove', activityHandler);
            window.removeEventListener('keydown', activityHandler);
        };
        // eslint-disable-next-line
    }, [setCurrentUser, navigate]);

    if (!showWarning) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 p-6 rounded shadow-lg max-w-md w-full text-center">
                <p>Your session will expire in 5 minutes due to inactivity.</p>
                <button
                    onClick={stayLoggedIn}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                    Stay Logged In
                </button>
            </div>
        </div>
    );
};

export default SessionTimeoutWarning;
