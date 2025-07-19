import { useState } from 'react';

const FilterSidebar = ({ onFilter }) => {
    const [formData, setFormData] = useState({
        search: '',
        search_area: '',
        price_min: '',
        price_max: '',
        bedrooms: '',
        bathrooms: ''
    });

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const query = new URLSearchParams(formData).toString();
        onFilter(query);
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow space-y-4 sticky top-4">
            <h2 className="text-xl font-semibold mb-2">Filter Listings</h2>

            <input
                type="text"
                name="search"
                placeholder="City or State"
                value={formData.search}
                onChange={handleChange}
                className="input w-full"
            />

            <input
                type="text"
                name="search_area"
                placeholder="Area"
                value={formData.search_area}
                onChange={handleChange}
                className="input w-full"
            />

            <div className="flex gap-2">
                <input
                    type="number"
                    name="price_min"
                    placeholder="Min Price"
                    value={formData.price_min}
                    onChange={handleChange}
                    className="input w-full"
                />
                <input
                    type="number"
                    name="price_max"
                    placeholder="Max Price"
                    value={formData.price_max}
                    onChange={handleChange}
                    className="input w-full"
                />
            </div>

            <select
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleChange}
                className="input w-full"
            >
                <option value="">Bedrooms</option>
                {[1, 2, 3, 4, 5].map(num => (
                    <option key={num} value={num}>{num}+</option>
                ))}
            </select>

            <select
                name="bathrooms"
                value={formData.bathrooms}
                onChange={handleChange}
                className="input w-full"
            >
                <option value="">Bathrooms</option>
                {[1, 2, 3, 4, 5].map(num => (
                    <option key={num} value={num}>{num}+</option>
                ))}
            </select>

            <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
            >
                🔍 Apply Filters
            </button>
        </form>
    );
};

export default FilterSidebar;
