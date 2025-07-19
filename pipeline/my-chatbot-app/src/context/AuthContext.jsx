import { createContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

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
                // Fetch user profile from backend
                const token = session.access_token;
                const res = await fetch('http://127.0.0.1:5000/api/user/profile', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const userData = await res.json();
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
