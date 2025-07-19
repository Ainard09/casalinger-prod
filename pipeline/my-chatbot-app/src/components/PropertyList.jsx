import { useEffect, useState } from 'react';
import axios from 'axios';

const PropertyList = () => {
    const [listings, setListings] = useState([]);

    useEffect(() => {
        axios.get('http://127.0.0.1:5000/api/featured-properties')
            .then(res => setListings(res.data.listings))
            .catch(err => console.error('Failed to load listings:', err));
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
            {listings.map(property => (
                <div key={property.id} className="bg-white shadow-md rounded-xl p-4">
                    {property.image_paths.length > 0 && (
                        <img src={property.image_paths[0]} alt={property.title} className="rounded-lg mb-2 w-full h-48 object-cover" />
                    )}
                    <h3 classNamse="font-semibold text-lg">{property.title}</h3>
                    <p className="text-sm text-gray-500">
                        <span className="font-bold text-black">₦{property.price.toLocaleString()}</span> – {property.area}, {property.city}, {property.state}
                    </p>
                    <p className="text-sm">bed {property.bedrooms} | bath {property.bathrooms}</p>
                </div>
            ))}
        </div>
    );
};

export default PropertyList;
