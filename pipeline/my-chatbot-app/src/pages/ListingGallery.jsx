import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight, FiX, FiHeart, FiShare2, FiArrowLeft } from 'react-icons/fi';
import { MapPin, Video, BadgeCheck, PawPrint, ChevronLeft, ChevronRight } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import ApplicationModal from '../components/ApplicationModal';
import ViewingModal from '../components/ViewingModal';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/config';

const ListingGallery = ({ listing: propListing, isModal = false, onClose }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useContext(AuthContext);
    const [listing, setListing] = useState(propListing || null);
    const [loading, setLoading] = useState(!propListing);
    const [error, setError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [showApplicationModal, setShowApplicationModal] = useState(false);
    const [showViewingModal, setShowViewingModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (propListing) {
            setListing(propListing);
            setIsFavorite(propListing.is_favorite || false);
            return;
        }

        const fetchListing = async () => {
            try {
                const res = await fetch(API_ENDPOINTS.LISTING_DETAILS(id));
                if (!res.ok) throw new Error('Failed to fetch listing');
                const data = await res.json();
                setListing(data);
                setIsFavorite(data.is_favorite || false);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchListing();
    }, [id, propListing]);

    const handleImageClick = (index) => {
        setSelectedImageIndex(index);
        setShowModal(true);
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

    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > 50;
        const isRightSwipe = distance < -50;

        if (isLeftSwipe) {
            handleNextImage();
        }
        if (isRightSwipe) {
            handlePrevImage();
        }

        setTouchStart(null);
        setTouchEnd(null);
    };

    const handleFavorite = () => {
        setIsFavorite(!isFavorite);
        // TODO: Implement favorite functionality
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
    };

    const handleBackToListing = () => {
        if (isModal && onClose) {
            onClose();
        } else {
            navigate(`/listing/${id}`);
        }
    };

    const handleApplicationSuccess = (data) => {
        setSuccessMessage(data.message);
        setTimeout(() => setSuccessMessage(''), 5000);
    };

    const handleViewingSuccess = (data) => {
        setSuccessMessage(data.message);
        setTimeout(() => setSuccessMessage(''), 5000);
    };

    if (loading) return <div className="text-center py-10">Loading...</div>;
    if (error) return <div className="text-center py-10 text-red-500">{error}</div>;
    if (!listing) return <div className="text-center py-10">Listing not found</div>;

    const { image_paths = [], video_path } = listing;
    const mediaItems = [
        ...image_paths.map((img) => ({ type: 'image', src: img })),
        ...(video_path ? [{ type: 'video', src: video_path }] : []),
    ];

    const rentPeriodAbbr = listing.rent_period === 'year' ? '/yr' : '/mo';

    return (
        <div className={`${isModal ? '' : 'min-h-screen bg-gray-50'}`}>
            {!isModal && (
                <div className="max-w-7xl mx-auto px-4 py-8">
                    {/* Top Action Bar */}
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={handleBackToListing}
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                        >
                            <FiArrowLeft className="w-4 h-4" />
                            Back to listing
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleFavorite}
                                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                                aria-label={isFavorite ? 'Unsave listing' : 'Save listing'}
                            >
                                <FiHeart
                                    className={`w-5 h-5 ${isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-600'}`}
                                />
                            </button>
                            <button
                                onClick={handleShare}
                                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                                aria-label="Share listing"
                            >
                                <FiShare2 className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Gallery Layout */}
            <div className={`${isModal ? '' : 'max-w-7xl mx-auto px-4'} grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8`}>
                {/* Photo Display Area */}
                <div className="lg:col-span-2">
                    <div className="space-y-4">
                        {/* Render photos in repeating pattern */}
                        {mediaItems.map((item, index) => {
                            const cyclePosition = index % 5; // 5 photos per cycle
                            
                            // Cycle pattern: 0=600px, 1=400px, 2=400px, 3=500px, 4=400px
                            let height, className;
                            
                            if (cyclePosition === 0) {
                                // 600px on desktop, 300px on mobile - full width
                                height = 'h-[300px] md:h-[400px] lg:h-[600px]';
                                className = 'w-full';
                            } else if (cyclePosition === 1 || cyclePosition === 2) {
                                // 400px on desktop, 200px on mobile - half width each
                                height = 'h-[200px] md:h-[300px] lg:h-[400px]';
                                className = 'w-full';
                            } else if (cyclePosition === 3) {
                                // 500px on desktop, 250px on mobile - full width
                                height = 'h-[250px] md:h-[350px] lg:h-[500px]';
                                className = 'w-full';
                            } else if (cyclePosition === 4) {
                                // 400px on desktop, 200px on mobile - half width
                                height = 'h-[200px] md:h-[300px] lg:h-[400px]';
                                className = 'w-full';
                            }

                            // Determine if this photo should start a new row
                            const shouldStartNewRow = cyclePosition === 0 || cyclePosition === 3;
                            const isInPair = cyclePosition === 1 || cyclePosition === 2 || cyclePosition === 4;

                            // If it's the first photo of a pair, start a new grid row
                            if (cyclePosition === 1 || cyclePosition === 4) {
                                return (
                                    <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                                        {/* First photo of pair */}
                                        <div 
                                            className="relative cursor-pointer group"
                                            onClick={() => handleImageClick(index)}
                                        >
                                            {item.type === 'image' ? (
                                                <img
                                                    src={item.src}
                                                    alt={`${listing.title} ${index + 1}`}
                                                    className={`${className} ${height} object-cover rounded-lg`}
                                                />
                                            ) : (
                                                <div className={`${className} ${height} bg-gray-200 rounded-lg flex items-center justify-center`}>
                                                    <Video className="w-12 h-12 text-blue-600" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg"></div>
                                        </div>

                                        {/* Second photo of pair (if exists) */}
                                        {mediaItems[index + 1] && (cyclePosition === 1 || cyclePosition === 4) && (
                                            <div 
                                                className="relative cursor-pointer group"
                                                onClick={() => handleImageClick(index + 1)}
                                            >
                                                {mediaItems[index + 1].type === 'image' ? (
                                                    <img
                                                        src={mediaItems[index + 1].src}
                                                        alt={`${listing.title} ${index + 2}`}
                                                        className={`${className} ${height} object-cover rounded-lg`}
                                                    />
                                                ) : (
                                                    <div className={`${className} ${height} bg-gray-200 rounded-lg flex items-center justify-center`}>
                                                        <Video className="w-12 h-12 text-blue-600" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg"></div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // Single full-width photos (600px and 500px)
                            if (shouldStartNewRow) {
                                return (
                                    <div 
                                        key={index}
                                        className="relative cursor-pointer group"
                                        onClick={() => handleImageClick(index)}
                                    >
                                        {item.type === 'image' ? (
                                            <img
                                                src={item.src}
                                                alt={`${listing.title} ${index + 1}`}
                                                className={`${className} ${height} object-cover rounded-lg`}
                                            />
                                        ) : (
                                            <div className={`${className} ${height} bg-gray-200 rounded-lg flex items-center justify-center`}>
                                                <Video className="w-12 h-12 text-blue-600" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg"></div>
                                    </div>
                                );
                            }

                            // Skip photos that are part of a pair (they're rendered above)
                            if (cyclePosition === 2) {
                                return null;
                            }

                            return null;
                        })}
                    </div>
                </div>

                {/* Listing Details Panel */}
                <div className="lg:col-span-1 order-first lg:order-last">
                    <div className="bg-white rounded-lg shadow-lg p-4 lg:p-6 sticky top-6 mb-4 lg:mb-0">
                        {/* Price */}
                        <div className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
                            {listing.listing_type === 'complex' && listing.units && listing.units.length > 0 ? (
                                (() => {
                                    const allPrices = listing.units.flatMap(u => [u.price_min, u.price_max]).filter(p => p > 0);
                                    const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : listing.price;
                                    const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : listing.price;
                                    return minPrice === maxPrice ? 
                                        `₦${minPrice.toLocaleString()}${rentPeriodAbbr}` : 
                                        `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}${rentPeriodAbbr}`;
                                })()
                            ) : (
                                `₦${listing.price?.toLocaleString()}${rentPeriodAbbr}`
                            )}
                        </div>
                        
                        {/* Key Statistics */}
                        <div className="flex items-center gap-2 lg:gap-4 text-sm lg:text-base text-gray-600 mb-4">
                            {listing.listing_type === 'complex' && listing.units && listing.units.length > 0 ? (
                                (() => {
                                    const allBeds = listing.units.map(u => u.bedrooms).filter(b => b > 0);
                                    const allBaths = listing.units.map(u => u.bathrooms).filter(b => b > 0);
                                    const minBeds = allBeds.length > 0 ? Math.min(...allBeds) : listing.bedrooms;
                                    const maxBeds = allBeds.length > 0 ? Math.max(...allBeds) : listing.bedrooms;
                                    const minBaths = allBaths.length > 0 ? Math.min(...allBaths) : listing.bathrooms;
                                    const maxBaths = allBaths.length > 0 ? Math.max(...allBaths) : listing.bathrooms;
                                    
                                    return (
                                        <>
                                            <span>{minBeds === maxBeds ? `${minBeds} bd` : `${minBeds}–${maxBeds} bd`}</span>
                                            <span>{minBaths === maxBaths ? `${minBaths} ba` : `${minBaths}–${maxBaths} ba`}</span>
                                        </>
                                    );
                                })()
                            ) : (
                                <>
                                    <span>{listing.bedrooms} bd</span>
                                    <span>{listing.bathrooms} ba</span>
                                    {listing.sqft && <span>{listing.sqft.toLocaleString()} sqft</span>}
                                </>
                            )}
                        </div>
                        
                        {/* Address */}
                        <div className="text-gray-700 mb-6">
                            {listing.address || `${listing.area}, ${listing.city}, ${listing.state}`}
                        </div>
                        
                        {/* Call to Action Buttons */}
                        <button 
                            className="w-full bg-blue-600 text-white font-bold text-base lg:text-lg py-2 lg:py-3 rounded-full shadow hover:bg-blue-700 transition mb-2"
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
                            className="w-full bg-green-600 text-white font-bold text-base lg:text-lg py-2 lg:py-3 rounded-full shadow hover:bg-green-700 transition"
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
                    </div>
                </div>
            </div>



            {/* Modal Viewer */}
            {showModal && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <button
                        className="absolute top-2 md:top-4 right-2 md:right-4 z-10 w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 active:bg-white/40 transition-all duration-300 touch-manipulation"
                        onClick={() => setShowModal(false)}
                        aria-label="Close gallery"
                    >
                        <FiX className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </button>
                    <button
                        className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 active:bg-white/40 transition-all duration-300 touch-manipulation"
                        onClick={handlePrevImage}
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </button>
                    <button
                        className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 md:w-14 md:h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 hover:bg-white/30 active:bg-white/40 transition-all duration-300 touch-manipulation"
                        onClick={handleNextImage}
                        aria-label="Next image"
                    >
                        <ChevronRight className="w-6 h-6 md:w-7 md:h-7 text-white" />
                    </button>
                    <img
                        src={mediaItems[selectedImageIndex]?.src}
                        alt={`Property image ${selectedImageIndex + 1}`}
                        className="max-h-[90vh] max-w-[90vw] object-contain"
                    />
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm">
                        {selectedImageIndex + 1} / {mediaItems.length}
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
        </div>
    );
};

export default ListingGallery; 