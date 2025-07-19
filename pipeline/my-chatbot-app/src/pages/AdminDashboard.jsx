import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiStar, FiEye, FiHome, FiUsers, FiSettings, FiLogOut } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';
import { AuthContext } from '../context/AuthContext';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const { currentUser, setCurrentUser } = useContext(AuthContext);

    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [featuredOnly, setFeaturedOnly] = useState(false);
    const [promotedOnly, setPromotedOnly] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState('');
    const [agents, setAgents] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalProperties, setTotalProperties] = useState(0);

    useEffect(() => {
        if (!currentUser?.is_admin) {
            navigate('/admin/login');
            return;
        }
        fetchProperties();
        fetchAgents();
    }, [currentUser]);

    useEffect(() => {
        if (currentUser?.is_admin) {
            fetchProperties();
        }
    }, [currentPage, searchTerm, featuredOnly, promotedOnly, selectedAgent]);

    const fetchProperties = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: currentPage,
                per_page: 20,
                search: searchTerm,
                featured_only: featuredOnly.toString(),
                promoted_only: promotedOnly.toString(),
                agent_id: selectedAgent
            });
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;
            const res = await fetch(`http://127.0.0.1:5000/api/admin/properties?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });
            if (res.ok) {
                const data = await res.json();
                setProperties(data.properties || []);
                setTotalPages(data.pages || 1);
                setTotalProperties(data.total || 0);
            } else {
                const errorData = await res.json();
                console.error('Failed to fetch properties:', errorData);
            }
        } catch (error) {
            console.error('Error fetching properties:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAgents = async () => {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;
            const res = await fetch('http://127.0.0.1:5000/api/admin/agents', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });
            if (res.ok) {
                const data = await res.json();
                setAgents(data.agents);
            } else {
                console.error('Failed to fetch agents');
            }
        } catch (error) {
            console.error('Error fetching agents:', error);
        }
    };

    const handleFeatureToggle = async (propertyId, currentStatus) => {
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;
            const endpoint = currentStatus ? 'unfeature' : 'feature';
            const res = await fetch(`http://127.0.0.1:5000/api/admin/property/${propertyId}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                fetchProperties(); // Refresh the list
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to update property');
            }
        } catch (error) {
            console.error('Error updating property:', error);
            alert('Failed to update property');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('adminData');
        localStorage.removeItem('currentUser');
        setCurrentUser(null);
        navigate('/admin/login');
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN'
        }).format(price);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (!currentUser?.is_admin) return <div>Access denied</div>;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-4">
                        <div className="flex items-center">
                            <FiSettings className="h-8 w-8 text-blue-600 mr-3" />
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                                <p className="text-sm text-gray-500">Welcome, {currentUser?.name}</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-gray-500">
                                Role: {currentUser?.role || 'Admin'}
                            </span>
                            <button
                                className="flex items-center px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md"
                                onClick={handleLogout}
                            >
                                <FiLogOut className="mr-2" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                                <FiHome className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-500">Total Properties</p>
                                <p className="text-2xl font-semibold text-gray-900">{totalProperties}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                                <FiStar className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-500">Featured Properties</p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {properties.filter(p => p.is_featured).length}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-3 rounded-full bg-green-100 text-green-600">
                                <FiUsers className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-500">Active Agents</p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {new Set(properties.map(p => p.agent?.id)).size}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg shadow mb-6">
                    <div className="p-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                            <div className="flex-1 max-w-md">
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <FiSearch className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search properties..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={featuredOnly}
                                        onChange={(e) => setFeaturedOnly(e.target.checked)}
                                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Featured only</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={promotedOnly}
                                        onChange={(e) => setPromotedOnly(e.target.checked)}
                                        className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Promoted only</span>
                                </label>
                                <div className="flex items-center space-x-2">
                                    <label className="text-sm text-gray-700">Agent:</label>
                                    <select
                                        value={selectedAgent}
                                        onChange={(e) => setSelectedAgent(e.target.value)}
                                        className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="">All Agents</option>
                                        {agents.map(agent => (
                                            <option key={agent.id} value={agent.id}>
                                                {agent.name} ({agent.property_count} properties)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Properties List */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Properties</h3>
                    </div>
                    
                    {loading ? (
                        <div className="p-6 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-sm text-gray-500">Loading properties...</p>
                        </div>
                    ) : properties.length === 0 ? (
                        <div className="p-6 text-center">
                            <p className="text-gray-500">No properties found</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {properties.map((property) => (
                                <div key={property.id} className="p-6 hover:bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex-shrink-0">
                                                {property.image_paths && property.image_paths.length > 0 ? (
                                                    <img
                                                        src={property.image_paths[0]}
                                                        alt={property.title}
                                                        className="h-16 w-16 rounded-lg object-cover"
                                                    />
                                                ) : (
                                                    <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
                                                        <FiHome className="h-8 w-8 text-gray-400" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center space-x-2">
                                                    <h4 className="text-lg font-medium text-gray-900 truncate">
                                                        {property.title}
                                                    </h4>
                                                    {property.is_featured && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                            <FiStar className="w-3 h-3 mr-1" />
                                                            Featured
                                                        </span>
                                                    )}
                                                    {property.is_promoted && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            Promoted
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500">
                                                    {property.area}, {property.city}, {property.state}
                                                </p>
                                                <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                                                    <span>
                                                      {property.price_display && typeof property.price_display === 'string' && property.price_display.includes('-')
                                                        ? property.price_display.split('-').map((p, i, arr) =>
                                                            <span key={i}>
                                                              {formatPrice(Number(p.trim()))}{i === 0 && arr.length > 1 ? ' - ' : ''}
                                                            </span>
                                                          )
                                                        : formatPrice(Number(property.price_display || property.price))}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{property.bed_display ? property.bed_display : property.bedrooms} bed, {property.bath_display ? property.bath_display : property.bathrooms} bath</span>
                                                    <span>•</span>
                                                    <span>Added {formatDate(property.created_at)}</span>
                                                </div>
                                                {property.description && (
                                                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                                        {property.description}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {property.listing_type && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                            {property.listing_type}
                                                        </span>
                                                    )}
                                                    {property.rent_period && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            {property.rent_period}
                                                        </span>
                                                    )}
                                                </div>
                                                {property.agent && (
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        Agent: {property.agent.name} ({property.agent.agent_type})
                                                    </p>
                                                )}
                                                {!property.agent && (
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        No agent assigned
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => navigate(`/listing/${property.id}`)}
                                                className="p-2 text-gray-400 hover:text-gray-600"
                                                title="View property"
                                            >
                                                <FiEye className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleFeatureToggle(property.id, property.is_featured)}
                                                className={`p-2 rounded-md ${
                                                    property.is_featured
                                                        ? 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
                                                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                                }`}
                                                title={property.is_featured ? 'Unfeature property' : 'Feature property'}
                                            >
                                                <FiStar className={`w-5 h-5 ${property.is_featured ? 'fill-current' : ''}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-6 py-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-gray-700">
                                    Showing page {currentPage} of {totalPages}
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard; 