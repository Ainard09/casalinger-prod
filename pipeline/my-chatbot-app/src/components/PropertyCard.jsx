import { useState, useContext, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { API_ENDPOINTS } from '../utils/config';

const PropertyCard = ({ property, savedListings, toggleSave, hideHeart = false }) => {
    const { currentUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [randomTag, setRandomTag] = useState(null); // ✅ Random tag state
    const images = property.image_paths.slice(0, 3);

    // Touch swipe state
    const [touchStartX, setTouchStartX] = useState(null);
    const [touchEndX, setTouchEndX] = useState(null);

    const minSwipeDistance = 40; // Minimum px distance for swipe

    const onTouchStart = (e) => {
        setTouchEndX(null); // Reset previous
        setTouchStartX(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEndX(e.targetTouches[0].clientX);
    };

    const onTouchEnd = (e) => {
        if (!touchStartX || touchEndX === null) return;
        const distance = touchStartX - touchEndX;
        if (Math.abs(distance) > minSwipeDistance) {
            if (distance > 0) {
                // Swiped left
                setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
            } else {
                // Swiped right
                setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
            }
        }
    };

    // Helper function to calculate price range for complex listings
    const getPriceDisplay = () => {
        const period = property.rent_period || 'month';
        const periodAbbr = period === 'year' ? 'yr' : 'mo';
        
        if (property.listing_type === 'complex' && property.units && property.units.length > 0) {
            const prices = property.units.flatMap(unit => [unit.price_min, unit.price_max]).filter(p => p > 0);
            if (prices.length > 0) {
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                return minPrice === maxPrice 
                    ? `₦${minPrice.toLocaleString()}/${periodAbbr}`
                    : `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}/${periodAbbr}`;
            }
            // If no valid prices found in units, fall back to main listing price
            if (property.price > 0) {
                return `₦${property.price.toLocaleString()}/${periodAbbr}`;
            }
            return `Price on request/${periodAbbr}`;
        }
        return `₦${property.price.toLocaleString()}/${periodAbbr}`;
    };

    // Helper function to get bedroom/bathroom range for complex listings
    const getBedBathRange = () => {
        if (property.listing_type === 'complex' && property.units && property.units.length > 0) {
            const bedrooms = property.units.map(unit => unit.bedrooms).filter(b => b);
            const bathrooms = property.units.map(unit => unit.bathrooms).filter(b => b);
            
            if (bedrooms.length > 0 && bathrooms.length > 0) {
                const minBeds = Math.min(...bedrooms);
                const maxBeds = Math.max(...bedrooms);
                const minBaths = Math.min(...bathrooms);
                const maxBaths = Math.max(...bathrooms);
                
                const bedRange = minBeds === maxBeds ? `${minBeds}` : `${minBeds}–${maxBeds}`;
                const bathRange = minBaths === maxBaths ? `${minBaths}` : `${minBaths}–${maxBaths}`;
                
                return { bedRange, bathRange };
            }
        }
        return { bedRange: property.bedrooms, bathRange: property.bathrooms };
    };

    const getListingAgeLabel = () => {
        if (!property.created_at) return null;

        const createdAt = new Date(property.created_at);
        const now = new Date();
        const diffInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

        if (diffInDays > 30) {
            return 'Over a month ago on CasaLinger';
        } else if (diffInDays === 0) {
            return 'Today on CasaLinger';
        } else {
            return `${diffInDays} day${diffInDays > 1 ? 's' : ''} on CasaLinger`;
        }
    };

    const handlePrev = (e) => {
        e.preventDefault(); // Prevent default link behavior
        e.stopPropagation(); // Prevent navigation to listing details
        setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    };

    const handleNext = (e) => {
        e.preventDefault(); // Prevent default link behavior
        e.stopPropagation(); // Prevent navigation to listing details
        setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    };

    const handleSave = (e) => {
        e.preventDefault(); // Prevent default button behavior
        e.stopPropagation(); // Prevent event from bubbling up to parent links

        if (!currentUser) {
            alert('Please login to save listings');
            return;
        }

        if (currentUser.is_agent) {
            alert('Only renters are allowed to save properties.');
            return;
        }

        const isCurrentlySaved = savedListings.includes(property.id);
        toggleSave(property.id);
    
        fetch(API_ENDPOINTS.INTERACTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                listing_id: property.id,
                interaction_type: isCurrentlySaved ? 'unsave' : 'saved',
                user_id: currentUser?.id,
                title: property.title,
                city: property.city,
                state: property.state,
                area: property.area,
                tags: Array.isArray(property.tags) ? property.tags.join(',') : ''
            }),
        })
            .then((res) => res.json())
            .then((data) => console.log("💾 Saved interaction:", data))
            .catch((err) => console.error("❌ Error saving interaction:", err));
    };

    const isNew = (() => {
        if (!property.created_at) return false;
        const createdAt = new Date(property.created_at);
        const now = new Date();
        const diffInHours = Math.floor((now - createdAt) / (1000 * 60 * 60));
        return diffInHours < 24;
    })();

    useEffect(() => {
        const timer = setTimeout(() => setLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    // ✅ Tag randomizer runs once per property.tags change
    useEffect(() => {
        if (Array.isArray(property.tags) && property.tags.length > 0) {
            const randomIndex = Math.floor(Math.random() * property.tags.length);
            setRandomTag(property.tags[randomIndex]);
        } else {
            setRandomTag(null);
        }
    }, [property.tags]);

    const priceDisplay = getPriceDisplay();
    const { bedRange, bathRange } = getBedBathRange();

    return (
        <div
            className={`group bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transform transition-all duration-500 ease-in-out ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} hover:shadow-2xl hover:-translate-y-1`}
        >
            <Link to={`/listing/${property.id}`} className="block relative w-full h-56 overflow-hidden cursor-pointer touch-manipulation"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                {images.length > 0 && (
                    <img
                        src={images[currentImageIndex]}
                        alt={property.title}
                        className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
                    />
                )}
                {/* Badge */}
                <div className="absolute top-3 left-3 flex gap-2 z-10">
                    {isNew && (
                        <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">New</span>
                    )}
                    {property.listing_type === 'complex' && (
                        <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Complex</span>
                    )}
                    {randomTag && (
                        <span className="bg-blue-600/10 text-white text-xs font-semibold px-3 py-1 rounded-full shadow border border-blue-100">
                            {randomTag}
                        </span>
                    )}
                </div>
                {property.featured && !isNew && (
                    <span className="absolute top-3 left-3 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow z-10">Featured</span>
                )}
                {/* Days on CasaLinger at bottom left, badges at bottom right */}
                {getListingAgeLabel() && (
                    <div className="absolute bottom-2 left-2 z-10">
                        <div className="text-white text-xs bg-black/60 px-2 py-1 rounded font-light drop-shadow">
                            {getListingAgeLabel()}
                        </div>
                    </div>
                )}
                {(property.is_featured || property.is_promoted) && (
                    <div className="absolute bottom-2 right-2 flex items-end gap-2 z-10">
                        {property.is_featured && (
                            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Featured</span>
                        )}
                        {property.is_promoted && (
                            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1 rounded-full shadow">Promotion</span>
                        )}
                    </div>
                )}
                {/* Carousel Controls - only show on hover */}
                {images.length > 1 && (
                    <>
                        <button
                            onClick={handlePrev}
                            className="absolute top-1/2 left-2 transform -translate-y-1/2 bg-white/80 backdrop-blur-sm p-2 md:p-1.5 rounded-full shadow hover:scale-110 active:scale-95 transition z-10 opacity-0 group-hover:opacity-100 touch-manipulation pointer-events-auto"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-800" />
                        </button>
                        <button
                            onClick={handleNext}
                            className="absolute top-1/2 right-2 transform -translate-y-1/2 bg-white/80 backdrop-blur-sm p-2 md:p-1.5 rounded-full shadow hover:scale-110 active:scale-95 transition z-10 opacity-0 group-hover:opacity-100 touch-manipulation pointer-events-auto"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-800" />
                        </button>
                    </>
                )}
                {/* Save Button */}
                {!hideHeart && (
                    <button
                        onClick={handleSave}
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => e.preventDefault()}
                        className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm p-2.5 md:p-2 rounded-full shadow hover:scale-110 active:scale-95 transition z-10 touch-manipulation"
                        title="Save this property"
                        type="button"
                    >
                        {savedListings.includes(property.id) ? (
                            <Heart className="text-blue-600 fill-blue-600 w-6 h-6" />
                        ) : (
                            <Heart className="text-gray-400 fill-transparent w-6 h-6" />
                        )}
                    </button>
                )}
                {/* Image Dots */}
                {images.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1 z-10">
                        {images.map((_, index) => (
                            <span
                                key={index}
                                className={`w-2.5 h-2.5 rounded-full ${currentImageIndex === index ? 'bg-white' : 'border border-white bg-white/40'}`}
                            />
                        ))}
                    </div>
                )}
            </Link>
            {/* Info */}
            <div className="p-5 relative">
                <Link to={`/listing/${property.id}`} className="block">
                    <h3 className="text-xl font-bold hover:text-blue-600 transition mb-1 font-sans cursor-pointer" style={{ fontFamily: 'Urbanist, sans-serif' }}>{property.title}</h3>
                </Link>
                <p className="text-base text-gray-700 mb-1">
                    <span className="font-bold text-black">{priceDisplay}</span>
                </p>
                <p className="text-sm text-gray-600">{property.area}, {property.city}, {property.state}</p>
                <div className="flex items-center gap-3 text-sm text-gray-500 mt-2">
                    <span className="inline-flex items-center gap-1"><span role="img" aria-label="bed">🛏️</span> {bedRange} bd</span>
                    <span className="inline-flex items-center gap-1"><span role="img" aria-label="bath">🛁</span> {bathRange} ba</span>
                </div>
            </div>
        </div>
    );
};

export default PropertyCard;





