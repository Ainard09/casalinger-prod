import { useContext, useEffect, useState, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import PropertyCard from '../components/PropertyCard';
import { supabase } from '../utils/supabaseClient';
import Footer from '../components/Footer';
import { API_ENDPOINTS } from '../utils/config';

const Dashboard = () => {
    const { currentUser } = useContext(AuthContext);
    const [userInfo, setUserInfo] = useState(null);
    const [savedProperties, setSavedProperties] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const recommendationsRef = useRef(null);

    const scrollRecommendations = (direction) => {
        if (recommendationsRef.current) {
            recommendationsRef.current.scrollBy({
                left: direction === 'left' ? -350 : 350,
                behavior: 'smooth'
            });
        }
    };

    useEffect(() => {
        const fetchDashboard = async () => {
            if (!currentUser) return;
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const session = sessionData?.session;
                const token = session?.access_token;
                if (!token) return;
                const res = await fetch(API_ENDPOINTS.USER_PROFILE, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const userData = await res.json();
                    setUserInfo(userData);
                }
                // Fetch dashboard data (saved properties, recommendations)
                const dashRes = await fetch(API_ENDPOINTS.USER_DASHBOARD(currentUser.id), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (dashRes.ok) {
                    const dashData = await dashRes.json();
                    setSavedProperties(dashData.saved_properties || []);
                    setRecommendations(dashData.recommendations || []);
                }
            } catch (err) {
                console.error('❌ Failed to load dashboard:', err);
            }
        };
        fetchDashboard();
    }, [currentUser]);

    const handleUnsave = (listingId) => {
        fetch(API_ENDPOINTS.INTERACTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                listing_id: listingId,
                interaction_type: 'unsave',
                user_id: currentUser?.id
            })
        })
            .then(res => res.json())
            .then(data => {
                setSavedProperties(prev => prev.filter(p => p.id !== listingId));
            })
            .catch(err => console.error('❌ Failed to unsave:', err));
    };

    if (!currentUser) {
        return <p className="p-6 text-center">Please log in to view your dashboard.</p>;
    }

    // Helper for initials
    const getInitials = (name) => {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Header Box */}
                <div className="flex items-center bg-white rounded-xl shadow p-6 mb-10 border border-gray-200">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow mr-6">
                        {getInitials(userInfo?.name)}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold mb-1">Welcome, {userInfo?.name}</h2>
                        <p className="text-sm text-gray-500">{userInfo?.email}</p>
                    </div>
                </div>

                {/* Saved Listings Section */}
                <section className="mb-10">
                    <h3 className="text-xl font-semibold mb-4">Saved Properties</h3>
                    {savedProperties.length === 0 ? (
                        <p className="text-gray-500 mb-6">You haven't saved any properties yet.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {savedProperties.map(prop => (
                                <div key={prop.id} className="relative">
                                    <PropertyCard 
                                        property={prop} 
                                        savedListings={savedProperties.map(p => p.id)} 
                                        toggleSave={() => handleUnsave(prop.id)} 
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Recommended for You Section */}
                {recommendations.length > 0 && (
                    <section className="mb-10">
                        <h3 className="text-xl font-semibold mb-4">Recommended Properties You May Like</h3>
                        <div className="relative">
                            <div
                                ref={recommendationsRef}
                                className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth py-2 px-1"
                                style={{ scrollSnapType: 'x mandatory' }}
                            >
                                {recommendations.map((rec) => (
                                    <div key={rec.id} className="flex-shrink-0 w-64 md:w-72 scroll-snap-align-start">
                                        <PropertyCard property={rec} savedListings={savedProperties.map(p => p.id)} toggleSave={() => {}} hideHeart={true} />
                                    </div>
                                ))}
                            </div>

                            {/* Scroll Buttons */}
                            <button
                                onClick={() => scrollRecommendations('left')}
                                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 backdrop-blur-sm rounded-full shadow-md p-2 hover:bg-white transition-transform duration-200 hover:scale-110 hidden md:flex"
                            >
                                <ChevronLeft className="w-6 h-6 text-gray-700" />
                            </button>
                            <button
                                onClick={() => scrollRecommendations('right')}
                                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 backdrop-blur-sm rounded-full shadow-md p-2 hover:bg-white transition-transform duration-200 hover:scale-110 hidden md:flex"
                            >
                                <ChevronRight className="w-6 h-6 text-gray-700" />
                            </button>
                        </div>
                    </section>
                )}
            </div>
            <Footer />
        </div>
    );
};

export default Dashboard;


