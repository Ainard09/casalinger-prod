import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { BedDouble, Bath, Filter, ChevronDown, Search as SearchIcon, RefreshCcw } from 'lucide-react';
import { API_ENDPOINTS } from '../utils/config';

const TAG_OPTIONS = [
    "Luxury", "Modern", "Coastal", "Security", "Garden", "Ocean View", "Duplex", "Stable Light",
    "Family-friendly", "Quiet", "Smart Home", "Pet Friendly", "Urban", "Green Energy"
];

const defaultFormData = {
    search: '',
    search_area: '',
    price_min: '',
    price_max: '',
    bedrooms: '',
    bathrooms: '',
    sort_by: '',
    tags: []
};

const SearchForm = ({ onSearch, onReset }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [lockedLocation, setLockedLocation] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
    const tagDropdownRef = useRef(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'search' && lockedLocation) return; // Lock if from HeroBanner
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTagToggle = (tag) => {
        setFormData(prev => {
            const tags = prev.tags.includes(tag)
                ? prev.tags.filter(t => t !== tag)
                : [...prev.tags, tag];
            return { ...prev, tags };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const queryObj = {
            ...formData,
            tags: formData.tags.join(','),
            search: lockedLocation || formData.search,
        };
        const query = new URLSearchParams(queryObj).toString();
        try {
            const res = await axios.get(`${API_ENDPOINTS.SEARCH_PROPERTIES}?${query}`);
            onSearch(res.data.listings);
        } catch (err) {
            console.error("Search error:", err);
        }
    };

    const handleReset = () => {
        setFormData(defaultFormData);
        onReset();
    };

    useEffect(() => {
        if (!tagDropdownOpen) return;
        function handleClick(e) {
            if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target)) {
                setTagDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [tagDropdownOpen]);

    useEffect(() => {
        const handleHeroSearch = (e) => {
            const location = e.detail && typeof e.detail === 'string' ? e.detail : '';
            if (!location) return;
            setLockedLocation(location);
            setFormData(prev => ({ ...prev, search: location }));
        };
        window.addEventListener('hero-search', handleHeroSearch);
        return () => window.removeEventListener('hero-search', handleHeroSearch);
    }, []);

    return (
        <div className="mb-6">
            {/* Toggle button on mobile */}
            <div className="md:hidden mb-4">
                <button
                    onClick={() => setIsOpen(prev => !prev)}
                    className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded shadow flex items-center justify-center gap-2"
                >
                    <Filter className="w-5 h-5" />
                    {isOpen ? 'Hide Filters' : 'Show Filters'}
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Form */}
            <form
                onSubmit={handleSubmit}
                className={`bg-white/90 backdrop-blur-sm p-6 rounded-xl shadow space-y-4 ${isOpen ? '' : 'hidden'} md:block`}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <input
                        name="search"
                        type="text"
                        placeholder="City or State"
                        value={formData.search}
                        onChange={handleChange}
                        disabled={!!lockedLocation}
                        className={`input w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-400 ${lockedLocation ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                    />
                    <input
                        name="search_area"
                        type="text"
                        placeholder="Area"
                        value={formData.search_area}
                        onChange={handleChange}
                        className="input w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-400"
                    />
                    <div className="flex gap-2">
                        <input
                            name="price_min"
                            type="number"
                            placeholder="Min Price"
                            value={formData.price_min}
                            onChange={handleChange}
                            className="input w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-400"
                        />
                        <input
                            name="price_max"
                            type="number"
                            placeholder="Max Price"
                            value={formData.price_max}
                            onChange={handleChange}
                            className="input w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-400"
                        />
                    </div>
                    <div className="flex gap-2">
                        <div className="relative w-full">
                            <select
                                name="bedrooms"
                                value={formData.bedrooms}
                                onChange={handleChange}
                                className="input w-full border border-gray-200 rounded-lg px-4 py-2 appearance-none pr-10 focus:ring-2 focus:ring-blue-400"
                            >
                                <option value="">Bedrooms</option>
                                {[1, 2, 3, 4, 5].map(num => (
                                    <option key={num} value={num}>{num}+</option>
                                ))}
                            </select>
                            <BedDouble className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="relative w-full">
                            <select
                                name="bathrooms"
                                value={formData.bathrooms}
                                onChange={handleChange}
                                className="input w-full border border-gray-200 rounded-lg px-4 py-2 appearance-none pr-10 focus:ring-2 focus:ring-blue-400"
                            >
                                <option value="">Bathrooms</option>
                                {[1, 2, 3, 4, 5].map(num => (
                                    <option key={num} value={num}>{num}+</option>
                                ))}
                            </select>
                            <Bath className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    <select
                        name="sort_by"
                        value={formData.sort_by}
                        onChange={handleChange}
                        className="input w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-400"
                    >
                        <option value="">Sort By</option>
                        <option value="newest">Newest</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                    </select>
                    <div className="hidden sm:flex items-center relative">
                        <button
                            type="button"
                            onClick={() => setTagDropdownOpen(v => !v)}
                            className="px-4 py-1 rounded-full border text-sm font-medium bg-white border-gray-300 shadow-sm hover:bg-blue-50 transition"
                        >
                            Select Tags
                        </button>
                        <div className="inline-flex flex-wrap gap-2 ml-2 align-middle">
                            {formData.tags.map(tag => (
                                <span key={tag} className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200">
                                    {tag}
                                </span>
                            ))}
                        </div>
                        {tagDropdownOpen && (
                            <div ref={tagDropdownRef} className="absolute z-20 mt-2 right-0 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                                {TAG_OPTIONS.map(tag => (
                                    <button
                                        type="button"
                                        key={tag}
                                        onClick={() => handleTagToggle(tag)}
                                        className={`px-3 py-1 rounded-full border text-sm font-medium transition-all w-full focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                            formData.tags.includes(tag)
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-100 hover:shadow'
                                        }`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile tag picker */}
                <div className="sm:hidden mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (optional)</label>
                    <div className="overflow-x-auto whitespace-nowrap flex gap-2 pb-2 scrollbar-hide">
                        {TAG_OPTIONS.map(tag => (
                            <button
                                type="button"
                                key={tag}
                                onClick={() => handleTagToggle(tag)}
                                className={`px-4 py-1 rounded-full border text-sm font-medium transition-all w-max focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                    formData.tags.includes(tag)
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-100 hover:shadow'
                                }`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                    {formData.tags.length > 0 && (
                        <div className="mt-1 text-xs text-blue-700 font-medium">
                            Selected: {formData.tags.join(', ')}
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4">
                    <button
                        type="submit"
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded shadow-md w-full sm:w-auto"
                    >
                        <SearchIcon className="w-5 h-5" /> Search
                    </button>
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center justify-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-semibold py-2 px-6 rounded shadow-md w-full sm:w-auto"
                    >
                        <RefreshCcw className="w-5 h-5" /> Reset
                    </button>
                </div>
            </form>
        </div>
    );
};

export default SearchForm;



