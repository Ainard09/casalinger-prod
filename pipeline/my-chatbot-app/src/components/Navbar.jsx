import { useContext, useRef, useState, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import LogoutButton from './LogoutButton';
import { Link, useNavigate } from 'react-router-dom';
import { UserCircle, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTrendingUp } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';

const Navbar = () => {
    const { currentUser, setCurrentUser } = useContext(AuthContext);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [session, setSession] = useState(null); // Track Supabase session
    const [loading, setLoading] = useState(true); // Track session loading
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Check for Supabase session on mount and when auth changes
    useEffect(() => {
        setLoading(true);
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            supabase.auth.getSession().then(({ data: { session } }) => {
                setSession(session);
                setLoading(false);
                if (!session) {
                    setCurrentUser(null);
                    localStorage.removeItem('currentUser');
                }
            });
        });
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
            if (!session) {
                setCurrentUser(null);
                localStorage.removeItem('currentUser');
            }
        });
        return () => {
            listener?.subscription.unsubscribe();
        };
    }, [setCurrentUser]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        }
        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownOpen]);

    // Reset dropdown when user logs in or out
    useEffect(() => {
        setDropdownOpen(false);
    }, [currentUser, session]);

    // Check for admin status from localStorage and context
    const isAdmin = currentUser?.is_admin || localStorage.getItem('adminData');
    // Only consider logged in if BOTH session AND currentUser are present
    const isLoggedIn = isAdmin || (session && session.user && currentUser);



    // Only show profile icon if session && session.user or admin
    return (
        <nav className="fixed top-0 left-0 w-full z-50 bg-white/30 backdrop-blur-lg border-b border-white/40 shadow-xl transition-all" style={{ WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}>
            {/* Mobile Header */}
            <div className="flex md:hidden justify-between items-center px-4 py-3 relative w-full">
                {/* Hamburger at far left */}
                <button className="flex items-center" onClick={() => setMobileOpen((open) => !open)}>
                    <Menu className="w-7 h-7 text-gray-700" />
                </button>
                {/* Logo centered */}
                <Link to="/" className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                    <img
                        src="/CasaLinger logo.png"
                        alt="CasaLinger"
                        className="h-8 max-h-8 w-auto md:h-10 md:max-h-10 transition-all duration-200"
                    />
                </Link>
                {/* Profile icon at far right, first letter only, with dropdown */}
                <div className="flex items-center">
                    {loading ? (
                        <div className="text-sm text-gray-500">Loading...</div>
                    ) : (isAdmin || (session && session.user && currentUser)) ? (
                        <div className="relative flex items-center" ref={dropdownRef}>
                            <motion.button
                                whileHover={{ scale: 1.08, rotate: 2 }}
                                whileTap={{ scale: 0.97 }}
                                className="flex items-center gap-2 focus:outline-none"
                                onClick={() => setDropdownOpen((open) => !open)}
                                aria-label="User menu"
                            >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg text-lg">
                                    {isAdmin
                                        ? (currentUser?.name?.[0]?.toUpperCase() || 'A')
                                        : (currentUser?.name?.[0]?.toUpperCase() || (session?.user?.email && session.user.email[0]?.toUpperCase()))
                                    }
                                </div>
                            </motion.button>
                            <AnimatePresence>
                                {dropdownOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.18 }}
                                        className="absolute top-full right-0 mt-2 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                                    >
                                        {isAdmin ? (
                                            <>
                                                <Link to="/admin/dashboard" className="block px-4 py-2 text-blue-700 font-semibold hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Admin Dashboard</Link>
                                                <div className="border-t my-1" />
                                                <button
                                                    onClick={() => {
                                                        localStorage.removeItem('adminData');
                                                        localStorage.removeItem('currentUser');
                                                        setCurrentUser(null);
                                                        setDropdownOpen(false);
                                                        navigate('/admin/login');
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                                                >
                                                    Logout
                                                </button>
                                            </>
                                        ) : currentUser?.is_agent ? (
                                            <>
                                                <Link to="/agent/dashboard" className="block px-4 py-2 text-blue-700 font-semibold hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Agent Dashboard</Link>
                                                <Link to="/agent/profile" className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Agent Profile</Link>
                                                <div className="border-t my-1" />
                                                <button
                                                    onClick={() => {
                                                        localStorage.removeItem('adminData');
                                                        localStorage.removeItem('currentUser');
                                                        setCurrentUser(null);
                                                        setDropdownOpen(false);
                                                        navigate('/agent/login');
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                                                >
                                                    Logout
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <Link to="/dashboard" className="block px-4 py-2 text-blue-700 font-semibold hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Dashboard</Link>
                                                <Link to="#" className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Profile</Link>
                                                <div className="border-t my-1" />
                                                <button
                                                    onClick={() => {
                                                        localStorage.removeItem('adminData');
                                                        localStorage.removeItem('currentUser');
                                                        setCurrentUser(null);
                                                        setDropdownOpen(false);
                                                        navigate('/login');
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                                                >
                                                    Logout
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
                    )}
                </div>
            </div>
            {/* Desktop Header */}
            <div className="hidden md:flex justify-between items-center px-6 py-4 relative w-full">
                {/* Logo */}
                <Link to="/" className="flex items-center">
                    <img
                        src="/CasaLinger logo.png"
                        alt="CasaLinger"
                        className="h-10 max-h-10 w-auto transition-all duration-200"
                    />
                </Link>
                {/* Desktop navigation links */}
                <div className="flex items-center gap-4 md:gap-8">
                    <Link to="/" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition">Rent</Link>
                    <Link to="/buy" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition">Buy</Link>
                    <Link to="/shortlet" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition">Shortlet</Link>
                    <Link to="/agents" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition">Find an Agent</Link>
                    {(session && session.user && currentUser) && (
                        <Link to="/community" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition">Community Insights</Link>
                    )}
                    {!isLoggedIn && (
                        <button
                            className="px-3 py-2 rounded font-semibold text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition"
                            onClick={() => navigate('/agent/register')}
                        >
                            Post Listing
                        </button>
                    )}
                </div>
                {/* Profile avatar and dropdown for authenticated users (desktop) */}
                <div className="flex items-center gap-4">
                    {loading ? (
                        <div className="text-sm text-gray-500">Loading...</div>
                    ) : (isAdmin || (session && session.user && currentUser)) ? (
                        <div className="relative flex items-center" ref={dropdownRef}>
                            <motion.button
                                whileHover={{ scale: 1.08, rotate: 2 }}
                                whileTap={{ scale: 0.97 }}
                                className="flex items-center gap-2 focus:outline-none"
                                onClick={() => setDropdownOpen((open) => !open)}
                                aria-label="User menu"
                            >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg text-lg">
                                    {isAdmin
                                        ? (currentUser?.name?.[0]?.toUpperCase() || 'A')
                                        : (currentUser?.name?.[0]?.toUpperCase() || (session?.user?.email && session.user.email[0]?.toUpperCase()))
                                    }
                                </div>
                                <span className="font-medium text-gray-700 dark:text-gray-200">
                                    {isAdmin
                                        ? (currentUser?.name || 'Admin')
                                        : (currentUser?.name || session?.user?.email || '')
                                    }
                                </span>
                            </motion.button>
                            <AnimatePresence>
                                {dropdownOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.18 }}
                                        className="absolute top-full right-0 mt-2 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                                    >
                                        {isAdmin ? (
                                            <>
                                                <Link to="/admin/dashboard" className="block px-4 py-2 text-blue-700 font-semibold hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Admin Dashboard</Link>
                                                <div className="border-t my-1" />
                                                <button
                                                    onClick={() => {
                                                        localStorage.removeItem('adminData');
                                                        localStorage.removeItem('currentUser');
                                                        setCurrentUser(null);
                                                        setDropdownOpen(false);
                                                        navigate('/admin/login');
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                                                >
                                                    Logout
                                                </button>
                                            </>
                                        ) : currentUser?.is_agent ? (
                                            <>
                                                <Link to="/agent/dashboard" className="block px-4 py-2 text-blue-700 font-semibold hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Agent Dashboard</Link>
                                                <Link to="/agent/profile" className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Agent Profile</Link>
                                                <div className="border-t my-1" />
                                                <button
                                                    onClick={() => {
                                                        localStorage.removeItem('adminData');
                                                        localStorage.removeItem('currentUser');
                                                        setCurrentUser(null);
                                                        setDropdownOpen(false);
                                                        navigate('/agent/login');
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                                                >
                                                    Logout
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <Link to="/dashboard" className="block px-4 py-2 text-blue-700 font-semibold hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Dashboard</Link>
                                                <Link to="#" className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition" onClick={() => setDropdownOpen(false)}>Profile</Link>
                                                <div className="border-t my-1" />
                                                <button
                                                    onClick={() => {
                                                        localStorage.removeItem('adminData');
                                                        localStorage.removeItem('currentUser');
                                                        setCurrentUser(null);
                                                        setDropdownOpen(false);
                                                        navigate('/login');
                                                    }}
                                                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                                                >
                                                    Logout
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <>
                            <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
                            <Link to="/register" className="text-blue-600 hover:underline">Sign up</Link>
                        </>
                    )}
                </div>
            </div>
            {/* Mobile menu sliding overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 z-50 md:hidden bg-black/40"
                        onClick={() => setMobileOpen(false)}
                    >
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ duration: 0.25 }}
                            className="absolute left-4 top-16 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex flex-col gap-2"
                            onClick={e => e.stopPropagation()}
                        >
                            <button className="self-end mb-2" onClick={() => setMobileOpen(false)}>
                                <span className="text-2xl">&times;</span>
                            </button>
                            <Link to="/" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition" onClick={() => setMobileOpen(false)}>Rent</Link>
                            <Link to="/buy" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition" onClick={() => setMobileOpen(false)}>Buy</Link>
                            <Link to="/shortlet" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition" onClick={() => setMobileOpen(false)}>Shortlet</Link>
                            <Link to="/agents" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition" onClick={() => setMobileOpen(false)}>Find an Agent</Link>
                            {(session && session.user && currentUser) && (
                                <Link to="/community" className="px-3 py-2 rounded font-semibold text-gray-700 hover:bg-blue-100 hover:text-blue-700 transition" onClick={() => setMobileOpen(false)}>Community Insights</Link>
                            )}
                            {!isLoggedIn && (
                                <button
                                    className="px-3 py-2 rounded font-semibold text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition"
                                    onClick={() => { setMobileOpen(false); navigate('/agent/register'); }}
                                >
                                    Post Listing
                                </button>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
};

export default Navbar;



