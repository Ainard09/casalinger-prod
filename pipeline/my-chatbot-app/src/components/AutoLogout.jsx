import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AutoLogout = ({ logout }) => {
    const navigate = useNavigate();

    useEffect(() => {
        let timeout;
        const resetTimer = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                logout();  // your logout function
                navigate('/login');
            }, 1800000); // 30 minutes
        };

        const events = ['click', 'mousemove', 'keypress', 'scroll'];
        events.forEach(event => window.addEventListener(event, resetTimer));
        resetTimer(); // initialize timer

        return () => {
            events.forEach(event => window.removeEventListener(event, resetTimer));
            clearTimeout(timeout);
        };
    }, [logout, navigate]);

    return null; // doesn't render anything
};

export default AutoLogout;