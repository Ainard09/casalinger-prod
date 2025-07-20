import { createContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { API_ENDPOINTS } from '../utils/config';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(() => {
        const savedUser = localStorage.getItem('currentUser');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    useEffect(() => {
        // On mount, check Supabase session (v2+)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
                const token = session.access_token;
                let userData = null;
                // Try agent profile first
                let res = await fetch(API_ENDPOINTS.AGENT_PROFILE, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    userData = await res.json();
                    userData.is_agent = true;
                } else if (res.status !== 404) {
                    console.error('Error fetching agent profile:', res.status);
                }
                if (!userData) {
                    // Try user profile
                    res = await fetch(API_ENDPOINTS.USER_PROFILE, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        userData = await res.json();
                        userData.is_user = true;
                    } else if (res.status !== 404) {
                        console.error('Error fetching user profile:', res.status);
                    }
                }
                if (!userData) {
                    // Try admin profile
                    res = await fetch(API_ENDPOINTS.ADMIN_PROFILE, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        userData = await res.json();
                        userData.is_admin = true;
                    } else if (res.status !== 404) {
                        console.error('Error fetching admin profile:', res.status);
                    }
                }
                if (userData) {
                    setCurrentUser(userData);
                    localStorage.setItem('currentUser', JSON.stringify(userData));
                } else {
                    setCurrentUser(null);
                    localStorage.removeItem('currentUser');
                }
            } else {
                setCurrentUser(null);
                localStorage.removeItem('currentUser');
            }
        };
        checkSession();
    }, []);

    useEffect(() => {
        if (currentUser) {
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('currentUser');
        }
    }, [currentUser]);

    return (
        <AuthContext.Provider value={{ currentUser, setCurrentUser }}>
            {children}
        </AuthContext.Provider>
    );
};
