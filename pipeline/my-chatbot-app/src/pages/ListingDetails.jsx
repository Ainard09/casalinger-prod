import { useEffect, useState, useContext, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Thumbs } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';
import { Button } from '../ui/Button';
import { MapPin, Video, BadgeCheck, PawPrint, Home, Phone, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { FiHeart, FiShare2, FiMessageSquare, FiPlay, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import PropertyCard from '../components/PropertyCard';
import Footer from '../components/Footer';
import ApplicationModal from '../components/ApplicationModal';
import ViewingModal from '../components/ViewingModal';
import ListingGallery from './ListingGallery';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/config';

const TABS = [
  { label: 'Description', key: 'description' },
  { label: 'Features & Policies', key: 'features' },
  { label: "What's Available", key: 'units', showForComplex: true },
  { label: 'Agent Info', key: 'agent' },
];

const BADGES = [
  { key: 'has_3d_tour', label: '3D Tour', icon: <Video className="w-4 h-4 inline" /> },
  { key: 'pet_friendly', label: 'Pet Friendly', icon: <PawPrint className="w-4 h-4 inline" /> },
  { key: 'verified', label: 'Verified', icon: <BadgeCheck className="w-4 h-4 inline text-emerald-500" /> },
];

const ListingDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [listing, setListing] = useState(null);
    const [currentTab, setCurrentTab] = useState('description');
    const [thumbsSwiper, setThumbsSwiper] = useState(null);
    const { currentUser } = useContext(AuthContext);
    const [showApplicationModal, setShowApplicationModal] = useState(false);
    const [showViewingModal, setShowViewingModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const hasLoggedView = useRef(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFavorite, setIsFavorite] = useState(false);
    const [randomTag, setRandomTag] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState(null);
    const [showImageModal, setShowImageModal] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [unitFilter, setUnitFilter] = useState('all');
    const [expandedFloorplans, setExpandedFloorplans] = useState({});
    const [contactForm, setContactForm] = useState({
        name: '',
        email: '',
        phone: '',
        moveIn: '',
        message: `I am interested in ${listing?.title || 'this property'}.`,
    });
    const recommendationsRef = useRef(null);

    const rentPeriodAbbr = useMemo(() => {
        if (!listing?.rent_period) return '';
        return `/${listing.rent_period === 'year' ? 'yr' : 'mo'}`;
    }, [listing?.rent_period]);

    const isNew = useMemo(() => {
        if (!listing?.created_at) return false;
        const createdAt = new Date(listing.created_at);
        const now = new Date();
        return (now - createdAt) / (1000 * 60 * 60) < 24;
    }, [listing?.created_at]);

    const wasRecentlyUpdated = useMemo(() => {
        if (!listing?.updated_at || !listing?.created_at) return false;
        
        const updatedAt = new Date(listing.updated_at);
        const createdAt = new Date(listing.created_at);
        
        // Don't show "Updated" if it was just created (within a minute of creation)
        if (Math.abs(updatedAt - createdAt) < 60000) {
            return false;
        }

        const now = new Date();
        const diffInHours = (now - updatedAt) / (1000 * 60 * 60);
        return diffInHours < 24;
    }, [listing?.updated_at, listing?.created_at]);

    // Memoize the processed floorplan data to avoid re-calculation on every render
    const listingSummary = useMemo(() => {
        if (!listing) return { byBedroom: {}, filters: [], priceRange: '', bedRange: '', bathRange: '', sqft: null };
        
        // For individual listings, return simple values
        if (listing.listing_type !== 'complex' || !listing.units || listing.units.length === 0) {
            return {
                byBedroom: {},
                filters: [],
                priceRange: `₦${listing.price.toLocaleString()}${rentPeriodAbbr}`,
                bedRange: `${listing.bedrooms} bd`,
                bathRange: `${listing.bathrooms} ba`,
                sqft: listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : null
            };
        }

        // --- Process Complex Listing ---
        const parents = listing.units.filter(u => !u.name.includes(' - '));
        const children = listing.units.filter(u => u.name.includes(' - '));

        const floorplanMap = {};
        parents.forEach(p => {
            floorplanMap[p.name] = {
                ...p,
                child_units: children
                    .filter(c => c.name.startsWith(`${p.name} - `))
                    .map(c => ({ ...c, name: c.name.split(' - ')[1] }))
            };
        });

        const allUnits = Object.values(floorplanMap);
        const byBedroom = {};
        allUnits.forEach(fp => {
            const bedCount = fp.bedrooms;
            if (!byBedroom[bedCount]) byBedroom[bedCount] = [];
            byBedroom[bedCount].push(fp);
        });
        const filters = Object.keys(byBedroom).map(Number).sort((a, b) => a - b);

        // --- Calculate Summary Ranges ---
        const allPrices = allUnits.flatMap(u => [u.price_min, u.price_max]).filter(p => p > 0);
        const allBeds = allUnits.map(u => u.bedrooms).filter(b => b > 0);
        const allBaths = allUnits.map(u => u.bathrooms).filter(b => b > 0);

        const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : listing.price;
        const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : listing.price;
        const priceRange = (minPrice === maxPrice ? `₦${minPrice.toLocaleString()}` : `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}`) + rentPeriodAbbr;

        const minBeds = allBeds.length > 0 ? Math.min(...allBeds) : listing.bedrooms;
        const maxBeds = allBeds.length > 0 ? Math.max(...allBeds) : listing.bedrooms;
        const bedRange = minBeds === maxBeds ? `${minBeds} bd` : `${minBeds}–${maxBeds} bd`;

        const minBaths = allBaths.length > 0 ? Math.min(...allBaths) : listing.bathrooms;
        const maxBaths = allBaths.length > 0 ? Math.max(...allBaths) : listing.bathrooms;
        const bathRange = minBaths === maxBaths ? `${minBaths} ba` : `${minBaths}–${maxBaths} ba`;
        
        return { byBedroom, filters, priceRange, bedRange, bathRange, sqft: null };
    }, [listing, rentPeriodAbbr]);

    const getFilteredFloorplans = () => {
        if (unitFilter === 'all') {
            return listingSummary.byBedroom;
        }
        return { [unitFilter]: listingSummary.byBedroom[unitFilter] || [] };
    };

    const scrollRecommendations = (direction) => {
        if (recommendationsRef.current) {
            recommendationsRef.current.scrollBy({
                left: direction === 'left' ? -350 : 350,
                behavior: 'smooth'
            });
        }
    };

    useEffect(() => {
        if (listing?.tags && Array.isArray(listing.tags) && listing.tags.length > 0) {
            const randomIndex = Math.floor(Math.random() * listing.tags.length);
            setRandomTag(listing.tags[randomIndex]);
        }
    }, [listing?.tags]);

    // Prevent body scroll when gallery modal is open
    useEffect(() => {
        if (showGalleryModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showGalleryModal]);

    useEffect(() => {
        const fetchListing = async () => {
            try {
                const url = `${API_ENDPOINTS.LISTING_DETAILS(id)}${currentUser?.id ? `?user_id=${currentUser.id}` : ''}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch listing');
                const data = await res.json();
                setListing(data);
                setIsFavorite(data.is_favorite);
                if (!hasLoggedView.current && currentUser && !currentUser.is_agent) {
                    hasLoggedView.current = true;
                    fetch(API_ENDPOINTS.INTERACTION, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            listing_id: data.id,
                            interaction_type: 'view',
                            user_id: currentUser.id,
                            title: data.title,
                            city: data.city,
                            state: data.state,
                            area: data.area,
                            tags: Array.isArray(data.tags) ? data.tags.join(',') : ''
                        })
                    })
                        .then(response => {
                            if (!response.ok) throw new Error('Interaction POST failed');
                            return response.json();
                        })
                        .then(data => console.log("👁️ View interaction logged:", data))
                        .catch(err => console.error("❌ Interaction error:", err));
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchListing();
    }, [id, currentUser]);

    const handleFavorite = async () => {
        if (!currentUser) {
            alert('Please login to save listings');
            return;
        }

        if (currentUser.is_agent) {
            alert('Only renters are allowed to save properties.');
            return;
        }

        const prev = isFavorite;
        setIsFavorite(!isFavorite); // Optimistic UI update
        try {
            await fetch(API_ENDPOINTS.INTERACTION, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    listing_id: listing.id,
                    interaction_type: !prev ? 'saved' : 'unsave',
                    user_id: currentUser.id,
                    title: listing.title,
                    city: listing.city,
                    state: listing.state,
                    area: listing.area,
                    tags: Array.isArray(listing.tags) ? listing.tags.join(',') : ''
                })
            });
        } catch (err) {
            setIsFavorite(prev); // Revert on error
            alert('Failed to update favorite status.');
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
    };

    const handleInquiry = () => {
        if (!currentUser) {
            alert('Please login to send inquiries');
            return;
        }
        // Implement inquiry logic
    };

    const handleMediaClick = (media) => {
        setSelectedMedia(media);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedMedia(null);
    };

    const handleImageClick = (index) => {
        setSelectedImageIndex(index);
        setShowImageModal(true);
    };

    const handleNextImage = () => {
        setSelectedImageIndex((prev) => 
            prev === listing.image_paths.length - 1 ? 0 : prev + 1
        );
    };

    const handlePrevImage = () => {
        setSelectedImageIndex((prev) => 
            prev === 0 ? listing.image_paths.length - 1 : prev - 1
        );
    };

    const handleContactChange = (e) => {
        const { name, value } = e.target;
        setContactForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleContactSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            navigate('/login');
            return;
        }
        if (currentUser.is_agent) {
            alert('Agents cannot send messages to other agents.');
            return;
        }
        try {
            const res = await fetch(API_ENDPOINTS.SEND_MESSAGE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    listing_id: listing.id,
                    ...contactForm
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                alert('Your inquiry has been sent!');
                setContactForm({ name: '', email: '', phone: '', moveIn: '', message: `I am interested in ${listing?.title || 'this property'}.` });
            } else {
                alert(data.error || 'Failed to send message.');
            }
        } catch (err) {
            alert('Failed to send message.');
        }
    };

    const handleApplicationSuccess = (data) => {
        setSuccessMessage(data.message);
        // You can also show a toast notification here
        setTimeout(() => setSuccessMessage(''), 5000);
    };

    const handleViewingSuccess = (data) => {
        setSuccessMessage(data.message);
        // You can also show a toast notification here
        setTimeout(() => setSuccessMessage(''), 5000);
    };

    // Toggle floorplan visibility
    const toggleFloorplan = (fpName) => {
        setExpandedFloorplans(prev => ({ ...prev, [fpName]: !prev[fpName] }));
    };

    const formatAgentType = (agentType) => {
        if (!agentType) return '';
        return agentType
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    if (loading) return <div className="text-center py-10">Loading...</div>;
    if (error) return <div className="text-center py-10 text-red-500">{error}</div>;
    if (!listing) return <div className="text-center py-10">Listing not found</div>;

    const { image_paths = [], video_path, recommendations = [], lat, lng } = listing;
    const mediaSlides = [
        ...image_paths.map((img) => ({ type: 'image', src: img })),
        ...(video_path ? [{ type: 'video', src: video_path }] : []),
    ];

    const mediaItems = listing.media || [];
    const displayMedia = mediaItems.slice(0, 5);
    const remainingCount = mediaItems.length - 5;

    const filteredFloorplans = getFilteredFloorplans();

    return (
        <div className="min-h-screen w-full bg-blue-50">
            <div className="py-8">
                <div className="max-w-6xl mx-auto p-2 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 bg-white shadow-lg rounded-xl">
                    {/* Main Content */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                        {/* Media Carousel */}
                        <div>
                            <div className="relative">
                                <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
                                    {isNew && <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">New</span>}
                                    {wasRecentlyUpdated && !isNew && <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Updated</span>}
                                    {listing.listing_type === 'complex' && <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Complex</span>}
                                    {listing.featured && <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Featured</span>}
                                    {randomTag && <span className="bg-gray-700 text-white text-xs font-bold px-3 py-1 rounded-full shadow">{randomTag}</span>}
                                </div>
                                <Swiper
                                    modules={[Navigation, Thumbs]}
                                    navigation
                                    thumbs={{ swiper: thumbsSwiper }}
                                    className="rounded-xl shadow-lg mb-2 relative"
                                >
                                    {mediaSlides.map((slide, idx) => (
                                        <SwiperSlide key={idx}>
                                            {slide.type === 'image' ? (
                                                <img src={slide.src} alt={listing.title} className="w-full h-[350px] object-cover rounded-xl" />
                                            ) : (
                                                <video controls className="w-full h-[350px] object-cover rounded-xl">
                                                    <source src={slide.src} type="video/mp4" />
                                                    Your browser does not support the video tag.
                                                </video>
                                            )}
                                        </SwiperSlide>
                                    ))}
                                </Swiper>
                                
                                {/* See all photos button */}
                                {mediaSlides.length > 0 && (
                                    <button
                                        onClick={() => setShowGalleryModal(true)}
                                        className="absolute bottom-4 right-4 z-20 text-white text-xs bg-black/60 px-3 py-2 rounded font-light drop-shadow backdrop-blur-sm hover:bg-black/70 transition-all duration-200"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="grid grid-cols-2 gap-0.5">
                                                <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                                                <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                                                <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                                                <div className="w-1.5 h-1.5 bg-white rounded-sm"></div>
                                            </div>
                                            <span>See all {mediaSlides.length} photo{mediaSlides.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </button>
                                )}
                                <button
                                    onClick={handleFavorite}
                                    className="absolute top-4 right-4 z-10 bg-white rounded-full shadow-lg p-2 flex items-center justify-center"
                                    style={{ width: 48, height: 48 }}
                                    aria-label={isFavorite ? 'Unsave listing' : 'Save listing'}
                                >
                                    <FiHeart
                                        className={`w-8 h-8 transition-colors duration-200 ${isFavorite ? 'text-blue-600 fill-blue-600' : 'text-gray-700'}`}
                                        fill={isFavorite ? 'blue' : 'none'}
                                        strokeWidth={2.5}
                                    />
                                </button>
                            </div>
                            {/* Thumbnails */}
                            {mediaSlides.length > 1 && (
                                <Swiper
                                    onSwiper={setThumbsSwiper}
                                    slidesPerView={Math.min(mediaSlides.length, 6)}
                                    spaceBetween={8}
                                    watchSlidesProgress
                                    className="mt-2"
                                >
                                    {mediaSlides.map((slide, idx) => (
                                        <SwiperSlide key={idx}>
                                            {slide.type === 'image' ? (
                                                <img src={slide.src} alt="thumb" className="w-20 h-16 object-cover rounded cursor-pointer border border-gray-200 hover:border-blue-500" />
                                            ) : (
                                                <div className="w-20 h-16 flex items-center justify-center bg-gray-200 rounded cursor-pointer border border-gray-200 hover:border-blue-500">
                                                    <Video className="w-8 h-8 text-blue-600" />
                                                </div>
                                            )}
                                        </SwiperSlide>
                                    ))}
                                </Swiper>
                            )}
                        </div>
                        {/* Price, Address, Badges */}
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{listing.title}</h1>
                                <div className="text-gray-700 text-lg flex items-center gap-2 mb-2">
                                    <MapPin className="w-5 h-5 flex-shrink-0" />
                                    <span>{listing.address || `${listing.area}, ${listing.city}, ${listing.state}`}</span>
                                </div>
                                <p className="text-3xl font-bold text-blue-700 mb-2">{listingSummary.priceRange}</p>
                                
                                <div className="flex items-center gap-4 text-md text-gray-600">
                                    <span className="flex items-center gap-1.5"><span role="img" aria-label="bed">🛏️</span> {listingSummary.bedRange}</span>
                                    <span className="text-gray-300">|</span>
                                    <span className="flex items-center gap-1.5"><span role="img" aria-label="bath">🛁</span> {listingSummary.bathRange}</span>
                                    {listingSummary.sqft && (
                                        <>
                                            <span className="text-gray-300">|</span>
                                            <span>{listingSummary.sqft}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {BADGES.filter(b => listing[b.key]).map(badge => (
                                    <span key={badge.key} className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
                                        {badge.icon} {badge.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {/* Tabs */}
                        <div>
                            <div className="flex gap-2 border-b mb-4 overflow-x-auto pb-1">
                                {TABS.filter(tab => !tab.showForComplex || listing.listing_type === 'complex').map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setCurrentTab(tab.key)}
                                        className={`px-4 py-2 font-semibold border-b-2 transition whitespace-nowrap ${currentTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-blue-600'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <div>
                                {currentTab === 'description' && (
                                    <div>
                                        <h3 className="font-semibold text-lg mb-2">Listing Description</h3>
                                        <p className="text-gray-600 mb-6">{listing.description}</p>
                                    </div>
                                )}
                                {currentTab === 'features' && (
                                    <div>
                                        <h2 className="text-2xl font-bold mb-6 text-gray-800">Features & Policies</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {listing.amenities && (
                                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <Home className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-lg text-gray-800">Amenities</h4>
                                                    </div>
                                                    <p className="text-gray-600 whitespace-pre-wrap">{listing.amenities}</p>
                                                </div>
                                            )}
                                            {listing.interior_features && (
                                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <Home className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-lg text-gray-800">Interior Features</h4>
                                                    </div>
                                                    <p className="text-gray-600 whitespace-pre-wrap">{listing.interior_features}</p>
                                                </div>
                                            )}
                                            {listing.exterior_features && (
                                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <MapPin className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-lg text-gray-800">Exterior Features</h4>
                                                    </div>
                                                    <p className="text-gray-600 whitespace-pre-wrap">{listing.exterior_features}</p>
                                                </div>
                                            )}
                                            {listing.leasing_terms && (
                                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <Calendar className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-lg text-gray-800">Leasing Terms</h4>
                                                    </div>
                                                    <p className="text-gray-600 whitespace-pre-wrap">{listing.leasing_terms}</p>
                                                </div>
                                            )}
                                            {listing.policy && (
                                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <BadgeCheck className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-lg text-gray-800">Policy</h4>
                                                    </div>
                                                    <p className="text-gray-600 whitespace-pre-wrap">{listing.policy}</p>
                                                </div>
                                            )}
                                            {listing.availability_date && (
                                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <Calendar className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-lg text-gray-800">Availability</h4>
                                                    </div>
                                                    <p className="text-gray-600">
                                                        Available from {new Date(listing.availability_date.split(' ')[0]).toLocaleDateString('en-US', { 
                                                            year: 'numeric', 
                                                            month: 'long', 
                                                            day: 'numeric' 
                                                        })}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {currentTab === 'units' && listing.listing_type === 'complex' && (
                                    <div className="space-y-8">
                                        <div>
                                            <h2 className="text-2xl font-bold mb-4 text-gray-800">What's Available</h2>
                                            {/* Filter Tabs */}
                                            <div className="flex gap-2 mb-6 border-b pb-2">
                                                <button onClick={() => setUnitFilter('all')} className={`px-4 py-1.5 rounded-full font-medium text-sm transition ${unitFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                                                    All ({(() => {
                                                        // Count only available child units (units with " - " in name)
                                                        const availableChildUnits = listing.units.filter(u => 
                                                            u.name.includes(' - ') && u.is_available
                                                        );
                                                        // Count available parent floorplans that don't have any child units
                                                        const availableStandaloneFloorplans = listing.units.filter(u => {
                                                            if (u.name.includes(' - ')) return false; // Skip child units
                                                            // Check if this parent has any child units
                                                            const hasChildren = listing.units.some(child => 
                                                                child.name.includes(' - ') && child.name.startsWith(`${u.name} - `)
                                                            );
                                                            // If it has children, don't count it (children are counted separately)
                                                            if (hasChildren) return false;
                                                            // If no children, count it only if available
                                                            return u.is_available;
                                                        });
                                                        return availableChildUnits.length + availableStandaloneFloorplans.length;
                                                    })()})
                                                </button>
                                                {listingSummary.filters.map(bedroom => {
                                                    const floorplansInGroup = listingSummary.byBedroom[bedroom] || [];
                                                    const unitCount = floorplansInGroup.reduce((total, fp) => {
                                                        // Count available child units if they exist, otherwise count the floorplan itself if available
                                                        const availableChildUnits = listing.units.filter(u => 
                                                            u.name.includes(' - ') && 
                                                            u.name.startsWith(`${fp.name} - `) && 
                                                            u.is_available
                                                        );
                                                        if (availableChildUnits.length > 0) {
                                                            return total + availableChildUnits.length;
                                                        } else {
                                                            // If no child units, count the floorplan itself only if available
                                                            return total + (fp.is_available ? 1 : 0);
                                                        }
                                                    }, 0);
                                                    return (
                                                        <button key={bedroom} onClick={() => setUnitFilter(bedroom.toString())} className={`px-4 py-1.5 rounded-full font-medium text-sm transition ${unitFilter === bedroom.toString() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                                                            {bedroom} bd ({unitCount})
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {Object.keys(filteredFloorplans).map(bedroomGroup => {
                                            const floorplansInGroup = filteredFloorplans[bedroomGroup];
                                            const floorplanCount = floorplansInGroup.length;
                                            // Calculate available units only
                                            const availableUnitCount = floorplansInGroup.reduce((total, fp) => {
                                                // Count available child units if they exist, otherwise count the floorplan itself if available
                                                const availableChildUnits = listing.units.filter(u => 
                                                    u.name.includes(' - ') && 
                                                    u.name.startsWith(`${fp.name} - `) && 
                                                    u.is_available
                                                );
                                                if (availableChildUnits.length > 0) {
                                                    return total + availableChildUnits.length;
                                                } else {
                                                    // If no child units, count the floorplan itself only if available
                                                    return total + (fp.is_available ? 1 : 0);
                                                }
                                            }, 0);
                                            
                                            return (
                                                <div key={bedroomGroup}>
                                                    <h3 className="text-xl font-semibold mb-3">
                                                        {bedroomGroup} Bedroom ({floorplanCount} Floorplan{floorplanCount > 1 ? 's' : ''}
                                                        {availableUnitCount > 0 && `, ${availableUnitCount} Unit${availableUnitCount > 1 ? 's' : ''}`})
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {floorplansInGroup.map(fp => (
                                                            <div key={fp.id} className="border border-gray-200 rounded-lg">
                                                                {/* Floorplan Summary Row */}
                                                                <div className="grid grid-cols-5 gap-4 p-4 items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm sm:text-base flex-wrap">
                                                                    <div className="font-semibold text-blue-600 dark:text-blue-400 text-base sm:text-lg">{fp.name}</div>
                                                                    <div className="text-gray-700 dark:text-gray-200 text-xs sm:text-sm">{fp.bedrooms}bd / {fp.bathrooms}ba</div>
                                                                    <div className="text-gray-700 dark:text-gray-200 text-xs sm:text-sm">{fp.sqft && fp.sqft > 0 ? `${fp.sqft} sqft` : ''}</div>
                                                                    <div className="text-gray-900 dark:text-gray-100 font-bold text-sm sm:text-base">₦{fp.price_min.toLocaleString()}</div>
                                                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-2">
                                                                        <span className="text-green-700 dark:text-green-400 text-xs sm:text-sm">{fp.is_available ? 'Available Now' : 'Unavailable'}</span>
                                                                        {fp.child_units.length > 0 && (
                                                                            expandedFloorplans[fp.name] ? <ChevronUp /> : <ChevronDown />
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Expanded Individual Units */}
                                                                {expandedFloorplans[fp.name] && fp.child_units.length > 0 && (
                                                                    <div className="border-t bg-gray-50/50">
                                                                        {fp.child_units.map(unit => (
                                                                            <div key={unit.id} className="grid grid-cols-5 gap-4 p-4 items-center border-b last:border-b-0 text-gray-800 dark:text-gray-100 text-xs sm:text-sm flex-wrap">
                                                                                <div className="pl-8 font-semibold text-blue-600 dark:text-blue-400">{unit.name}</div>
                                                                                <div className="text-gray-700 dark:text-gray-200">{unit.bedrooms}bd / {unit.bathrooms}ba</div>
                                                                                <div className="text-gray-700 dark:text-gray-200">{unit.sqft && unit.sqft > 0 ? `${unit.sqft} sqft` : ''}</div>
                                                                                <div className="text-gray-900 dark:text-gray-100 font-bold">₦{unit.price_min.toLocaleString()}{rentPeriodAbbr}</div>
                                                                                <div className="text-green-700 dark:text-green-400">{unit.is_available ? 'Available Now' : 'Unavailable'}</div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {Object.keys(filteredFloorplans).length === 0 && (
                                            <div className="text-center py-8 text-gray-500">No units match the selected filter.</div>
                                        )}
                                    </div>
                                )}
                                {currentTab === 'agent' && listing.agent && (
                                    <div>
                                        <h2 className="text-2xl font-bold mb-6 text-gray-800">Agent Information</h2>
                                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Agent Basic Info */}
                                                <div>
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="bg-blue-100 p-3 rounded-full">
                                                            <Home className="w-6 h-6 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-semibold text-lg text-gray-800">
                                                                {listing.agent.name || 'Real Estate Agent'}
                                                            </h3>
                                                            <p className="text-blue-600 font-medium">
                                                                {formatAgentType(listing.agent.agent_type)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <p className="flex items-center gap-2 text-gray-600">
                                                            <BadgeCheck className="w-5 h-5 text-emerald-500" />
                                                            <span>Licensed Real Estate Professional</span>
                                                        </p>
                                                        {listing.agent.experience && (
                                                            <p className="flex items-center gap-2 text-gray-600">
                                                                <Calendar className="w-5 h-5 text-blue-600" />
                                                                <span>{listing.agent.experience} Years Experience</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Contact Information */}
                                                <div className="space-y-4">
                                                    <h4 className="font-semibold text-lg text-gray-800 mb-3">Contact Information</h4>
                                                    <div className="space-y-3">
                                                        <a 
                                                            href={`mailto:${listing.agent.email}`}
                                                            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
                                                        >
                                                            <div className="bg-gray-100 p-2 rounded">
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                                </svg>
                                                            </div>
                                                            {listing.agent.email}
                                                        </a>
                                                        <a 
                                                            href={`tel:${listing.agent.phone}`}
                                                            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
                                                        >
                                                            <div className="bg-gray-100 p-2 rounded">
                                                                <Phone className="w-5 h-5" />
                                                            </div>
                                                            {listing.agent.phone}
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Contact Form */}
                                            <div className="mt-8 pt-6 border-t border-gray-200">
                                                <h4 className="font-semibold text-lg text-gray-800 mb-4">Send a Message</h4>
                                                <form onSubmit={handleContactSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                                        <input
                                                            type="text"
                                                            name="name"
                                                            value={contactForm.name}
                                                            onChange={handleContactChange}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                                        <input
                                                            type="email"
                                                            name="email"
                                                            value={contactForm.email}
                                                            onChange={handleContactChange}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                            required
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                                        <input
                                                            type="tel"
                                                            name="phone"
                                                            value={contactForm.phone}
                                                            onChange={handleContactChange}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Move-in Date</label>
                                                        <input
                                                            type="date"
                                                            name="moveIn"
                                                            value={contactForm.moveIn}
                                                            onChange={handleContactChange}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                                                        <textarea
                                                            name="message"
                                                            value={contactForm.message}
                                                            onChange={handleContactChange}
                                                            rows={4}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                            required
                                                        ></textarea>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <button
                                                            type="submit"
                                                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                                                        >
                                                            Send Message
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Google Map */}
                        {listing.lat && listing.lng && (
                            <div className="mt-6">
                                <h3 className="font-semibold text-lg mb-2">Location</h3>
                                <div className="w-full h-64 rounded-xl overflow-hidden shadow">
                                    <iframe
                                        title="Google Map"
                                        width="100%"
                                        height="100%"
                                        frameBorder="0"
                                        className="w-full h-full"
                                        style={{ border: 0 }}
                                        src={`https://www.google.com/maps?q=${listing.lat},${listing.lng}&z=15&output=embed`}
                                        allowFullScreen
                                    ></iframe>
                                </div>
                            </div>
                        )}
                        {/* Recommended Listings */}
                        {recommendations && recommendations.length > 0 && (
                            <div className="mt-12">
                                <h2 className="text-2xl font-bold text-gray-800 mb-6">Recommended Properties Near You</h2>
                                <div className="relative">
                                    <div
                                        ref={recommendationsRef}
                                        className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth py-2 px-1"
                                        style={{ scrollSnapType: 'x mandatory' }}
                                    >
                                        {(recommendations.slice(0, 10)).map((rec) => (
                                            <div key={rec.id} className="flex-shrink-0 w-64 md:w-72 scroll-snap-align-start">
                                                <div 
                                                    className="cursor-pointer"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        console.log('Navigating to:', `/listing/${rec.id}`);
                                                        navigate(`/listing/${rec.id}`);
                                                    }}
                                                >
                                                    <PropertyCard 
                                                        property={rec} 
                                                        savedListings={[]} 
                                                        toggleSave={() => {}} 
                                                        hideHeart={true}
                                                    />
                                                </div>
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
                            </div>
                        )}
                    </div>
                    {/* Sidebar */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-6 sticky top-24">
                            <h2 className="text-xl font-bold mb-4">
                              Contact {listing.agent && listing.agent.name ? listing.agent.name : ''}
                            </h2>
                            <form onSubmit={handleContactSubmit} className="space-y-3">
                                <input
                                    name="name"
                                    value={contactForm.name}
                                    onChange={handleContactChange}
                                    placeholder="Full name *"
                                    className="w-full p-3 rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-200"
                                    required
                                />
                                <input
                                    name="email"
                                    value={contactForm.email}
                                    onChange={handleContactChange}
                                    placeholder="Email *"
                                    className="w-full p-3 rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-200"
                                    required
                                />
                                <input
                                    name="phone"
                                    value={contactForm.phone}
                                    onChange={handleContactChange}
                                    placeholder="Phone"
                                    className="w-full p-3 rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-200"
                                />
                                <div className="relative">
                                    <input
                                        type="date"
                                        name="moveIn"
                                        value={contactForm.moveIn}
                                        onChange={handleContactChange}
                                        placeholder="Desired move-in date *"
                                        className="w-full p-3 rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-200 pr-10"
                                        required
                                    />
                                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                                </div>
                                <div>
                                    <label className="block font-semibold text-sm mb-1">Message</label>
                                    <textarea
                                        name="message"
                                        value={contactForm.message}
                                        onChange={handleContactChange}
                                        className="w-full p-3 rounded-xl border border-gray-300 text-base focus:ring-2 focus:ring-blue-200"
                                        rows={3}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full bg-blue-600 text-white font-bold text-lg py-3 rounded-full shadow hover:bg-blue-700 transition mt-2"
                                >
                                    Send Message
                                </button>
                                <button
                                    type="button"
                                    className="w-full bg-blue-600 text-white font-bold text-lg py-3 rounded-full shadow hover:bg-blue-700 transition mt-2"
                                    onClick={() => {
                                        if (!currentUser) {
                                            navigate('/login');
                                            return;
                                        }
                                        if (currentUser.is_agent) {
                                            alert('Agents cannot schedule tours.');
                                            return;
                                        }
                                        setShowViewingModal(true);
                                    }}
                                >
                                    Schedule Tour
                                </button>
                                <button
                                    type="button"
                                    className="w-full bg-green-600 text-white font-bold text-lg py-3 rounded-full shadow hover:bg-green-700 transition mt-2"
                                    onClick={() => {
                                        if (!currentUser) {
                                            navigate('/login');
                                            return;
                                        }
                                        if (currentUser.is_agent) {
                                            alert('Agents cannot apply for listings.');
                                            return;
                                        }
                                        setShowApplicationModal(true);
                                    }}
                                >
                                    Apply
                                </button>
                            </form>
                        </div>
                    </div>
                    {/* Floating CTA Bar */}
                    <div className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-gray-200 shadow-lg flex justify-center gap-4 py-3 px-4 md:px-0 hidden">
                        <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-lg"><Phone className="w-5 h-5 mr-2" />Contact Agent</Button>
                        <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-lg"><Calendar className="w-5 h-5 mr-2" />Schedule Tour</Button>
                    </div>
                </div>
            </div>

            {/* Image Modal */}
            {showImageModal && (
                <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
                    <button
                        className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
                        onClick={() => setShowImageModal(false)}
                    >
                        <FiX size={32} />
                    </button>
                    <button
                        className="absolute left-4 text-white text-2xl hover:text-gray-300"
                        onClick={handlePrevImage}
                    >
                        <FiChevronLeft size={32} />
                    </button>
                    <button
                        className="absolute right-4 text-white text-2xl hover:text-gray-300"
                        onClick={handleNextImage}
                    >
                        <FiChevronRight size={32} />
                    </button>
                    <img
                        src={listing.image_paths[selectedImageIndex]}
                        alt={`Property image ${selectedImageIndex + 1}`}
                        className="max-h-[90vh] max-w-[90vw] object-contain"
                    />
                </div>
            )}

            {/* Modal Viewer */}
            {showModal && selectedMedia && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={closeModal}>
                    <div className="relative max-w-4xl w-full mx-4">
                        {selectedMedia.type === 'video' ? (
                            <video
                                src={selectedMedia.url}
                                controls
                                className="w-full rounded-lg"
                            />
                        ) : (
                            <img
                                src={selectedMedia}
                                alt="Selected media"
                                className="w-full rounded-lg"
                            />
                        )}
                        <button
                            className="absolute top-4 right-4 text-white text-2xl"
                            onClick={closeModal}
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {/* Success message */}
            {successMessage && (
                <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50">
                    {successMessage}
                </div>
            )}

            {/* Modals */}
            <ApplicationModal
                isOpen={showApplicationModal}
                onClose={() => setShowApplicationModal(false)}
                listing={listing}
                onSuccess={handleApplicationSuccess}
            />
            
            <ViewingModal
                isOpen={showViewingModal}
                onClose={() => setShowViewingModal(false)}
                listing={listing}
                onSuccess={handleViewingSuccess}
            />

            {/* Gallery Modal */}
            {showGalleryModal && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowGalleryModal(false);
                        }
                    }}
                >
                    <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">All Photos</h2>
                            <button
                                onClick={() => setShowGalleryModal(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <FiX className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6">
                            <ListingGallery listing={listing} isModal={true} onClose={() => setShowGalleryModal(false)} />
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default ListingDetails;



