import { useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../utils/supabaseClient';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/config';

const PrivateRoute = ({ children }) => {
    const { currentUser, setCurrentUser } = useContext(AuthContext);
    const location = useLocation();
    const [checking, setChecking] = useState(true);
    const [isAuthed, setIsAuthed] = useState(!!currentUser);

    useEffect(() => {
        if (!currentUser) {
            // Check Supabase session
            const session = supabase.auth.session();
            if (session && session.user) {
                // Fetch user profile from backend
                const fetchProfile = async () => {
                    const token = session.access_token;
                    let userData = null;
                    // Try agent profile first
                    let res = await fetch(API_ENDPOINTS.AGENT_PROFILE, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        userData = await res.json();
                        userData.is_agent = true;
                    } else {
                        // Try user profile
                        res = await fetch(API_ENDPOINTS.USER_PROFILE, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                            userData = await res.json();
                            userData.is_user = true;
                        } else {
                            // Try admin profile
                            res = await fetch(API_ENDPOINTS.ADMIN_PROFILE, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (res.ok) {
                                userData = await res.json();
                                userData.is_admin = true;
                            }
                        }
                    }
                    if (userData) {
                        setCurrentUser(userData);
                        localStorage.setItem('currentUser', JSON.stringify(userData));
                        setIsAuthed(true);
                    } else {
                        setIsAuthed(false);
                    }
                    setChecking(false);
                };
                fetchProfile();
            } else {
                setIsAuthed(false);
                setChecking(false);
            }
        } else {
            setIsAuthed(true);
            setChecking(false);
        }
    }, [currentUser, setCurrentUser]);

    if (checking) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100">Checking authentication...</div>;
    }

    if (!isAuthed) {
        if (location.pathname.startsWith('/agent/')) {
            return <Navigate to="/agent/login" state={{ from: location }} replace />;
        }
        if (location.pathname.startsWith('/admin/')) {
            return <Navigate to="/admin/login" state={{ from: location }} replace />;
        }
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // For admin routes, ensure user is admin
    if (location.pathname.startsWith('/admin/') && !currentUser?.is_admin) {
        return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    return children;
};

export default PrivateRoute; 