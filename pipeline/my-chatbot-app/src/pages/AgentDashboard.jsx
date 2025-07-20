import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import ReelCard from '../components/ReelCard';
import ApplicationDetailModal from '../components/ApplicationDetailModal';
import BookingDetailModal from '../components/BookingDetailModal';
import { FiUpload, FiHome, FiEye, FiVideo, FiUser, FiFileText, FiCalendar, FiCheck, FiX, FiClock, FiEye as FiView, FiTrendingUp } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';
import Footer from '../components/Footer';
import { API_ENDPOINTS } from '../utils/config';

const AgentDashboard = () => {
    const { currentUser } = useContext(AuthContext);
    const [agent, setAgent] = useState(null);
    const [listings, setListings] = useState([]);
    const [applications, setApplications] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [applicationsLoading, setApplicationsLoading] = useState(true);
    const [bookingsLoading, setBookingsLoading] = useState(true);
    const [uploadingListings, setUploadingListings] = useState(new Set());
    const [selectedApplication, setSelectedApplication] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const navigate = useNavigate();

    // Stats calculations
    const totalListings = listings.length;
    const totalViews = listings.reduce((sum, listing) => sum + (listing.views || 0), 0);
    const totalReels = listings.reduce((sum, listing) => sum + (listing.reels?.length || 0), 0);
    const totalApplications = applications.length;
    const totalBookings = bookings.length;

    useEffect(() => {
        const fetchAgentData = async () => {
            if (!currentUser) return;
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const session = sessionData?.session;
                const token = session?.access_token;
                if (!token) return;
                // Fetch agent profile
                const res = await fetch(API_ENDPOINTS.AGENT_PROFILE, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const agentData = await res.json();
                    setAgent(agentData);
                }
                // Fetch listings
                const listingsRes = await fetch(API_ENDPOINTS.AGENT_LISTINGS(currentUser.id), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (listingsRes.ok) {
                    const data = await listingsRes.json();
                    setListings(data.listings || []);
                }
                setLoading(false);
                // Fetch applications
                const appsRes = await fetch(API_ENDPOINTS.AGENT_APPLICATIONS(currentUser.id), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (appsRes.ok) {
                    const data = await appsRes.json();
                    if (data.success) {
                        setApplications(data.applications || []);
                    }
                }
                setApplicationsLoading(false);
                // Fetch bookings
                const bookingsRes = await fetch(API_ENDPOINTS.AGENT_BOOKINGS(currentUser.id), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (bookingsRes.ok) {
                    const data = await bookingsRes.json();
                    if (data.success) {
                        setBookings(data.bookings || []);
                    }
                }
                setBookingsLoading(false);
            } catch (err) {
                setLoading(false);
                setApplicationsLoading(false);
                setBookingsLoading(false);
            }
        };
        fetchAgentData();
    }, [currentUser]);

    const handleReelUpload = async (event, listingId) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file size (50MB = 50 * 1024 * 1024 bytes)
        const maxSize = 50 * 1024 * 1024; // 50MB in bytes
        if (file.size > maxSize) {
            alert('❌ File size too large! Please select a video file smaller than 50MB.');
            return;
        }

        setUploadingListings(prev => new Set([...prev, listingId]));
        
        try {
            // Upload to Supabase Storage
            const fileName = `${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage
                .from('reels')
                .upload(fileName, file);

            if (error) {
                throw error;
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('reels')
                .getPublicUrl(fileName);

            // Send the public URL to backend to save in database
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;

            const res = await fetch(API_ENDPOINTS.UPLOAD_REEL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    reel_url: publicUrl,
                    listing_id: listingId
                })
            });

            const responseData = await res.json();
            if (res.ok) {
                // Update listings state with the new reel URL
                setListings(prev => prev.map(listing => 
                    listing.id === listingId 
                        ? { ...listing, reels: [...(listing.reels || []), publicUrl] }
                        : listing
                ));
            } else {
                throw new Error(responseData.error || 'Failed to save reel to database');
            }
        } catch (err) {
            console.error('Reel upload error:', err);
            alert('❌ Failed to upload reel: ' + err.message);
        } finally {
            setUploadingListings(prev => {
                const newSet = new Set(prev);
                newSet.delete(listingId);
                return newSet;
            });
        }
    };

    const handleDeleteReel = async (reelUrl, listingId) => {
        try {
            // Extract filename from Supabase Storage URL
            const urlParts = reelUrl.split('/');
            const fileName = urlParts[urlParts.length - 1];

            // Delete from Supabase Storage
            const { error: storageError } = await supabase.storage
                .from('reels')
                .remove([fileName]);

            if (storageError) {
                throw storageError;
            }

            // Delete from database
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;

            const res = await fetch(API_ENDPOINTS.DELETE_REEL, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ reel_url: reelUrl, listing_id: listingId }),
            });

            if (res.ok) {
                setListings(prev =>
                    prev.map(listing =>
                        listing.id === listingId
                            ? { ...listing, reels: listing.reels.filter(r => r !== reelUrl) }
                            : listing
                    )
                );
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete reel from database');
            }
        } catch (err) {
            console.error('❌ Failed to delete reel:', err);
            alert('An error occurred while deleting the reel: ' + err.message);
        }
    };

    const handlePromote = async (listingId) => {
        try {
            // Prompt for promotion duration
            const daysInput = prompt('How many days would you like to promote this property? (Enter a number, default is 7 days):', '7');
            
            if (daysInput === null) {
                return; // User cancelled
            }
            
            const days = parseInt(daysInput) || 7;
            if (days < 1 || days > 365) {
                alert('Please enter a valid number of days (1-365).');
                return;
            }
            
            // Calculate promotion end date
            const promotedUntil = new Date();
            promotedUntil.setDate(promotedUntil.getDate() + days);
            
            const res = await fetch(API_ENDPOINTS.PROMOTE_LISTING(listingId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    promoted_until: promotedUntil.toISOString()
                })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`Listing promoted for ${days} days!`);
                // Update promoted status in UI
                setListings(prev => prev.map(listing =>
                    listing.id === listingId ? { 
                        ...listing, 
                        is_promoted: true,
                        promoted_until: data.promoted_until 
                    } : listing
                ));
            } else {
                alert(data.error || 'Failed to promote listing.');
            }
        } catch (err) {
            alert('Failed to promote listing.');
        }
    };

    const handlePausePromotion = async (listingId) => {
        try {
            const res = await fetch(API_ENDPOINTS.PAUSE_PROMOTION(listingId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || 'Promotion paused!');
                // Update promoted status in UI
                setListings(prev => prev.map(listing =>
                    listing.id === listingId ? { 
                        ...listing, 
                        is_promoted: false,
                        paused_at: new Date().toISOString(),
                        remaining_days: data.remaining_days
                    } : listing
                ));
            } else {
                alert(data.error || 'Failed to pause promotion.');
            }
        } catch (err) {
            alert('Failed to pause promotion.');
        }
    };

    const handleResumePromotion = async (listingId) => {
        try {
            const res = await fetch(API_ENDPOINTS.RESUME_PROMOTION(listingId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || 'Promotion resumed!');
                // Update promoted status in UI
                setListings(prev => prev.map(listing =>
                    listing.id === listingId ? { 
                        ...listing, 
                        is_promoted: true,
                        promoted_until: data.promoted_until,
                        paused_at: null,
                        remaining_days: null
                    } : listing
                ));
            } else {
                alert(data.error || 'Failed to resume promotion.');
            }
        } catch (err) {
            alert('Failed to resume promotion.');
        }
    };

    const formatAgentType = (type) => {
        if (!type) return '';
        return type
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const handleUpdateApplicationStatus = async (applicationId, newStatus) => {
        try {
            const res = await fetch(API_ENDPOINTS.UPDATE_APPLICATION_STATUS(applicationId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || `Application ${newStatus}!`);
                // Update application status in UI
                setApplications(prev => prev.map(app =>
                    app.application_id === applicationId ? { ...app, status: newStatus } : app
                ));
            } else {
                alert(data.error || 'Failed to update application status.');
            }
        } catch (err) {
            console.error('❌ Failed to update application status:', err);
            alert('An error occurred while updating the application status.');
        }
    };

    const handleUpdateBookingStatus = async (bookingId, newStatus) => {
        try {
            const res = await fetch(API_ENDPOINTS.UPDATE_BOOKING_STATUS(bookingId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || `Booking ${newStatus}!`);
                // Update booking status in UI
                setBookings(prev => prev.map(booking =>
                    booking.booking_id === bookingId ? { ...booking, status: newStatus } : booking
                ));
            } else {
                alert(data.error || 'Failed to update booking status.');
            }
        } catch (err) {
            console.error('❌ Failed to update booking status:', err);
            alert('An error occurred while updating the booking status.');
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'approved': return 'bg-green-100 text-green-800';
            case 'rejected': return 'bg-red-100 text-red-800';
            case 'confirmed': return 'bg-green-100 text-green-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatPromotionDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const isPromotionExpired = (promotedUntil) => {
        if (!promotedUntil) return false;
        return new Date(promotedUntil) < new Date();
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Agent Profile Header */}
                {agent && (
                    <div className="flex flex-col sm:flex-row items-center justify-between bg-white rounded-xl shadow p-6 mb-10 border border-gray-200 gap-4">
                        <div className="flex items-center">
                            <img
                                src={agent.photo_url ? agent.photo_url : 'https://via.placeholder.com/150'}
                                alt="Profile"
                                className="h-20 w-20 rounded-full object-cover border-4 border-white shadow mr-6"
                            />
                            <div>
                                <h2 className="text-2xl font-bold mb-1">Welcome, {agent.name}</h2>
                                <p className="text-sm text-gray-500">{agent.email}</p>
                                <p className="text-sm text-gray-500">{agent.agent_type}</p>
                            </div>
                        </div>
                        {/* Dashboard Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-end">
                            <Link
                                to="/agent/analytics"
                                className="inline-flex items-center justify-center px-5 py-3 rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition"
                            >
                                <FiTrendingUp className="mr-2" />
                                Analytics
                            </Link>
                            <Link
                                to="/post-listing"
                                className="inline-flex items-center justify-center px-5 py-3 rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition"
                            >
                                <FiUpload className="mr-2" />
                                Upload Listing
                            </Link>
                        </div>
                    </div>
                )}
                {/* Stats Section */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-center">
                                <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                                    <FiHome className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Total Listings</p>
                                    <p className="text-2xl font-semibold text-gray-900">{totalListings}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-center">
                                <div className="p-3 rounded-full bg-green-100 text-green-600">
                                    <FiEye className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Total Views</p>
                                    <p className="text-2xl font-semibold text-gray-900">{totalViews}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-center">
                                <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                                    <FiVideo className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Total Reels</p>
                                    <p className="text-2xl font-semibold text-gray-900">{totalReels}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-center">
                                <div className="p-3 rounded-full bg-orange-100 text-orange-600">
                                    <FiFileText className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Applications</p>
                                    <p className="text-2xl font-semibold text-gray-900">{totalApplications}</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-center">
                                <div className="p-3 rounded-full bg-indigo-100 text-indigo-600">
                                    <FiCalendar className="w-6 h-6" />
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Inspections</p>
                                    <p className="text-2xl font-semibold text-gray-900">{totalBookings}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Listings Section */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Listings</h2>

                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {[1, 2, 3].map((n) => (
                                <div key={n} className="bg-white rounded-lg shadow animate-pulse">
                                    <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                                    <div className="p-4">
                                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : listings.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg shadow">
                            <div className="mx-auto w-24 h-24 text-gray-400">
                                <FiHome className="w-full h-full" />
                            </div>
                            <h3 className="mt-4 text-lg font-medium text-gray-900">No listings yet</h3>
                            <p className="mt-2 text-sm text-gray-500">
                                Get started by creating your first property listing.
                            </p>
                            <div className="mt-6">
                                <Link
                                    to="/post-listing"
                                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    <FiHome className="mr-2" />
                                    Post Your First Listing
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {listings.map(listing => (
                                <div
                                    key={listing.id}
                                    className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-300 overflow-hidden"
                                >
                                    <Link to={`/listing/${listing.id}`} className="block">
                                        {listing.image_paths.length > 0 ? (
                                            <div className="relative h-48">
                                                <img
                                                    src={listing.image_paths[0]}
                                                    alt={listing.title}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-300"></div>
                                            </div>
                                        ) : (
                                            <div className="h-48 bg-gray-100 flex items-center justify-center">
                                                <FiHome className="w-12 h-12 text-gray-400" />
                                            </div>
                                        )}
                                        <div className="p-4">
                                            <h4 className="font-semibold text-lg text-gray-900 mb-1 line-clamp-1">
                                                {listing.title}
                                            </h4>
                                            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                                                {listing.listing_type === 'complex' && listing.price_display ? 
                                                    `₦${listing.price_display.toLocaleString()}` : 
                                                    `₦${listing.price.toLocaleString()}`
                                                } • {listing.area}, {listing.city}, {listing.state}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                                <span>🛏️ {listing.bed_display || listing.bedrooms || 'N/A'} bd</span>
                                                <span>🛁 {listing.bath_display || listing.bathrooms || 'N/A'} ba</span>
                                                {listing.listing_type === 'complex' && (
                                                    <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">Complex</span>
                                                )}
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Reel Upload Section */}
                                    <div className="px-4 py-3 border-t border-gray-100">
                                        <label className="relative flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer transition-colors">
                                            <FiUpload className="mr-2" />
                                            {uploadingListings.has(listing.id) ? 'Uploading...' : 'Upload Reel'}
                                            <input
                                                type="file"
                                                accept="video/mp4,video/webm,video/quicktime,.mov"
                                                onChange={e => handleReelUpload(e, listing.id)}
                                                className="sr-only"
                                                disabled={uploadingListings.has(listing.id)}
                                            />
                                        </label>
                                        <p className="text-xs text-gray-500 text-center mt-1">Max file size: 50MB</p>
                                    </div>

                                    {/* Edit Button */}
                                    <div className="px-4 pb-3 flex flex-col gap-2">
                                        <button
                                            onClick={() => navigate(`/listing/edit/${listing.id}`)}
                                            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                                        >
                                            Edit
                                        </button>
                                        {listing.is_promoted && !isPromotionExpired(listing.promoted_until) ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-semibold">Promoted</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePausePromotion(listing.id);
                                                        }}
                                                        className="text-red-600 hover:text-red-700 font-medium text-xs border border-red-200 rounded px-2 py-1"
                                                    >
                                                        Pause
                                                    </button>
                                                </div>
                                                {listing.promoted_until && (
                                                    <div className="text-xs text-gray-600">
                                                        Until: {formatPromotionDate(listing.promoted_until)}
                                                        {isPromotionExpired(listing.promoted_until) && (
                                                            <span className="text-red-600 ml-1">(Expired)</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : listing.remaining_days && listing.remaining_days > 0 ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-semibold">Paused</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleResumePromotion(listing.id);
                                                        }}
                                                        className="text-green-600 hover:text-green-700 font-medium text-xs border border-green-200 rounded px-2 py-1"
                                                    >
                                                        Resume
                                                    </button>
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                    {listing.remaining_days.toFixed(1)} days remaining
                                                </div>
                                                {listing.paused_at && (
                                                    <div className="text-xs text-gray-500">
                                                        Paused: {formatPromotionDate(listing.paused_at)}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handlePromote(listing.id)}
                                                className="text-green-600 hover:text-green-700 font-medium text-sm border border-green-200 rounded px-2 py-1 mt-1"
                                            >
                                                Promote this property
                                            </button>
                                        )}
                                    </div>

                                    {/* Reel Preview Section */}
                                    {listing.reels && listing.reels.length > 0 && (
                                        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                                            {listing.reels.map((reelUrl, index) => (
                                                <div key={index} className="relative">
                                                    <ReelCard
                                                        title={listing.title}
                                                        location={`${listing.area}, ${listing.city}, ${listing.state}`}
                                                        tags={listing.tags || []}
                                                        videoUrl={reelUrl}
                                                        index={index}
                                                    />
                                                    <button
                                                        onClick={() => handleDeleteReel(reelUrl, listing.id)}
                                                        className="absolute top-2 right-2 bg-white text-gray-600 rounded-full p-1 shadow hover:bg-red-500 hover:text-white transition-colors"
                                                        title="Delete Reel"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Applications Section */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Property Applications</h2>

                    {applicationsLoading ? (
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="animate-pulse space-y-4">
                                {[1, 2, 3].map((n) => (
                                    <div key={n} className="border-b border-gray-200 pb-4">
                                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : applications.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg shadow">
                            <div className="mx-auto w-24 h-24 text-gray-400">
                                <FiFileText className="w-full h-full" />
                            </div>
                            <h3 className="mt-4 text-lg font-medium text-gray-900">No applications yet</h3>
                            <p className="mt-2 text-sm text-gray-500">
                                Applications from potential tenants will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applicant</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Income</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Move-in Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {applications.map((application) => (
                                            <tr key={application.application_id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{application.applicant_name}</div>
                                                        <div className="text-sm text-gray-500">{application.applicant_email}</div>
                                                        <div className="text-sm text-gray-500">{application.applicant_phone}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{application.property_title}</div>
                                                        <div className="text-sm text-gray-500">{application.property_location}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">₦{application.monthly_income?.toLocaleString() || 'N/A'}</div>
                                                    <div className="text-sm text-gray-500">{application.employment_status}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">{formatDate(application.move_in_date)}</div>
                                                    <div className="text-sm text-gray-500">{application.lease_duration} months</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(application.status)}`}>
                                                        {application.status}
                                                    </span>
                                                </td>
                                                                                             <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                     <div className="flex flex-col space-y-2">
                                                         <button
                                                             onClick={() => {
                                                                 setSelectedApplication(application);
                                                                 setIsApplicationModalOpen(true);
                                                             }}
                                                             className="text-blue-600 hover:text-blue-900 flex items-center"
                                                         >
                                                             <FiView className="mr-1" />
                                                             View Details
                                                         </button>
                                                         {application.status === 'pending' && (
                                                             <div className="flex space-x-2">
                                                                 <button
                                                                     onClick={() => handleUpdateApplicationStatus(application.application_id, 'approved')}
                                                                     className="text-green-600 hover:text-green-900 flex items-center text-xs"
                                                                 >
                                                                     <FiCheck className="mr-1" />
                                                                     Approve
                                                                 </button>
                                                                 <button
                                                                     onClick={() => handleUpdateApplicationStatus(application.application_id, 'rejected')}
                                                                     className="text-red-600 hover:text-red-900 flex items-center text-xs"
                                                                 >
                                                                     <FiX className="mr-1" />
                                                                     Reject
                                                                 </button>
                                                             </div>
                                                         )}
                                                     </div>
                                                 </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Bookings Section */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Viewing Bookings</h2>

                    {bookingsLoading ? (
                        <div className="bg-white rounded-lg shadow p-6">
                            <div className="animate-pulse space-y-4">
                                {[1, 2, 3].map((n) => (
                                    <div key={n} className="border-b border-gray-200 pb-4">
                                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg shadow">
                            <div className="mx-auto w-24 h-24 text-gray-400">
                                <FiCalendar className="w-full h-full" />
                            </div>
                            <h3 className="mt-4 text-lg font-medium text-gray-900">No bookings yet</h3>
                            <p className="mt-2 text-sm text-gray-500">
                                Viewing bookings from potential tenants will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Viewer</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Viewing Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alternative</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {bookings.map((booking) => (
                                            <tr key={booking.booking_id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{booking.viewer_name}</div>
                                                        <div className="text-sm text-gray-500">{booking.viewer_email}</div>
                                                        <div className="text-sm text-gray-500">{booking.viewer_phone}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{booking.property_title}</div>
                                                        <div className="text-sm text-gray-500">{booking.property_location}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">{formatDate(booking.viewing_date)}</div>
                                                    <div className="text-sm text-gray-500">{booking.viewing_time}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {booking.alternative_date && (
                                                        <div>
                                                            <div className="text-sm text-gray-900">{formatDate(booking.alternative_date)}</div>
                                                            <div className="text-sm text-gray-500">{booking.alternative_time}</div>
                                                        </div>
                                                    )}
                                                    {!booking.alternative_date && (
                                                        <span className="text-sm text-gray-500">None</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(booking.status)}`}>
                                                        {booking.status}
                                                    </span>
                                                </td>
                                                                                             <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                     <div className="flex flex-col space-y-2">
                                                         <button
                                                             onClick={() => {
                                                                 setSelectedBooking(booking);
                                                                 setIsBookingModalOpen(true);
                                                             }}
                                                             className="text-blue-600 hover:text-blue-900 flex items-center"
                                                         >
                                                             <FiView className="mr-1" />
                                                             View Details
                                                         </button>
                                                         {booking.status === 'pending' && (
                                                             <div className="flex space-x-2">
                                                                 <button
                                                                     onClick={() => handleUpdateBookingStatus(booking.booking_id, 'confirmed')}
                                                                     className="text-green-600 hover:text-green-900 flex items-center text-xs"
                                                                 >
                                                                     <FiCheck className="mr-1" />
                                                                     Confirm
                                                                 </button>
                                                                 <button
                                                                     onClick={() => handleUpdateBookingStatus(booking.booking_id, 'cancelled')}
                                                                     className="text-red-600 hover:text-red-900 flex items-center text-xs"
                                                                 >
                                                                     <FiX className="mr-1" />
                                                                     Cancel
                                                                 </button>
                                                             </div>
                                                         )}
                                                     </div>
                                                 </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Application Detail Modal */}
                <ApplicationDetailModal
                    application={selectedApplication}
                    isOpen={isApplicationModalOpen}
                    onClose={() => {
                        setIsApplicationModalOpen(false);
                        setSelectedApplication(null);
                    }}
                    onUpdateStatus={(applicationId, status) => {
                        handleUpdateApplicationStatus(applicationId, status);
                        setIsApplicationModalOpen(false);
                        setSelectedApplication(null);
                    }}
                />

                {/* Booking Detail Modal */}
                <BookingDetailModal
                    booking={selectedBooking}
                    isOpen={isBookingModalOpen}
                    onClose={() => {
                        setIsBookingModalOpen(false);
                        setSelectedBooking(null);
                    }}
                    onUpdateStatus={(bookingId, status) => {
                        handleUpdateBookingStatus(bookingId, status);
                        setIsBookingModalOpen(false);
                        setSelectedBooking(null);
                    }}
                />
            </div>
            <Footer />
        </div>
    );
};

export default AgentDashboard;




