import { Link } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import LogoutButton from './LogoutButton';

const Header = () => {
    const { currentUser } = useContext(AuthContext);

    return (
        <header className="bg-white shadow sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                <Link to="/" className="text-2xl font-bold text-blue-700">🏠 CasaLinger</Link>

                <nav className="flex items-center gap-6 text-sm text-gray-700">
                    <Link to="/" className="hover:text-blue-600">Home</Link>
                    {currentUser && <Link to="/dashboard" className="hover:text-blue-600">Dashboard</Link>}
                    {!currentUser && (
                        <>
                            <Link to="/login" className="hover:text-blue-600">Login</Link>
                            <Link to="/register" className="hover:text-blue-600">Register</Link>
                        </>
                    )}
                    {currentUser && (
                        <>
                            <span className="text-gray-500">Hi, {currentUser.name}</span>
                            <LogoutButton />
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Header;
