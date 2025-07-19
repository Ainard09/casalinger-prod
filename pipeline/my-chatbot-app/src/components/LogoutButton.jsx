import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const LogoutButton = () => {
    const { currentUser, setCurrentUser } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleLogout = () => {
        setCurrentUser(null); // This clears currentUser and localStorage
        localStorage.removeItem('currentUser');
        if (currentUser && currentUser.is_agent) {
            navigate('/agent/login');   // Redirect agent to agent login page
        } else {
            navigate('/login');   // Redirect user to login page
        }
    };

    return (
        <button
            onClick={handleLogout}
            className="text-red-600 hover:underline ml-4"
        >
            Logout
        </button>
    );
};

export default LogoutButton;

