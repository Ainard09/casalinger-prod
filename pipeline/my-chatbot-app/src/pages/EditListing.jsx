import { useState, useContext, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { FiUpload, FiTag, FiImage, FiVideo, FiHome, FiPlus, FiTrash2, FiEdit, FiChevronDown, FiChevronUp, FiCopy, FiMapPin, FiClock, FiSave } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';
import { API_ENDPOINTS } from '../utils/config';

const TAG_OPTIONS = [
    "Luxury", "Modern", "Coastal", "Security", "Garden", "Ocean View",
    "Family-friendly", "Quiet", "Smart Home", "Pet Friendly", "Urban", "Green Energy"
];

const EditListing = () => {
    const { currentUser } = useContext(AuthContext);
    const navigate = useNavigate();
    const { id: listingId } = useParams();
    const [form, setForm] = useState({
        title: '',
        description: '',
        price: '',
        bedrooms: '',
        bathrooms: '',
        sqft: '',
        city: '',
        state: '',
        area: '',
        tags: '',
        amenities: '',
        interior_features: '',
        exterior_features: '',
        leasing_terms: '',
        policy: '',
        availability_date: '',
        listing_type: 'individual',
        address: '',
        rent_period: 'year',
    });
    const [images, setImages] = useState([]);
    const [video, setVideo] = useState(null);
    const [selectedTags, setSelectedTags] = useState([]);
    const [error, setError] = useState('');
    const [floorplans, setFloorplans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [expandedFloorplans, setExpandedFloorplans] = useState({});
    const [existingImages, setExistingImages] = useState([]);
    const [existingVideo, setExistingVideo] = useState('');

    useEffect(() => {
        const fetchListingData = async () => {
            try {
                const { data } = await axios.get(API_ENDPOINTS.GET_LISTING(listingId));
                setForm({
                    title: data.title || '',
                    description: data.description || '',
                    price: data.price || '',
                    bedrooms: data.bedrooms || '',
                    bathrooms: data.bathrooms || '',
                    sqft: data.sqft || '',
                    city: data.city || '',
                    state: data.state || '',
                    area: data.area || '',
                    tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
                    amenities: data.amenities || '',
                    interior_features: data.interior_features || '',
                    exterior_features: data.exterior_features || '',
                    leasing_terms: data.leasing_terms || '',
                    policy: data.policy || '',
                    availability_date: data.availability_date ? data.availability_date.split('T')[0] : '',
                    listing_type: data.listing_type || 'individual',
                    address: data.address || '',
                    rent_period: data.rent_period || 'year',
                });

                // Set selected tags for the tag selector
                if (Array.isArray(data.tags)) {
                    setSelectedTags(data.tags);
                } else if (data.tags && typeof data.tags === 'string') {
                    setSelectedTags(data.tags.split(',').map(tag => tag.trim()).filter(tag => tag));
                }

                if (data.listing_type === 'complex' && data.units && data.units.length > 0) {
                    const parentUnits = data.units.filter(u => !u.name.includes(' - '));
                    const childUnits = data.units.filter(u => u.name.includes(' - '));

                    const fetchedFloorplans = parentUnits.map((p, index) => ({
                        id: `fp-${index}-${Date.now()}`,
                        name: p.name,
                        beds: p.bedrooms,
                        baths: p.bathrooms,
                        sqft: p.sqft,
                        units: childUnits
                            .filter(c => c.name.startsWith(`${p.name} - `))
                            .map((c, unitIndex) => ({
                                id: `unit-${index}-${unitIndex}-${Date.now()}`,
                                name: c.name.split(' - ')[1],
                                price: c.price_min,
                                availability: c.is_available
                            }))
                    }));
                    setFloorplans(fetchedFloorplans);
                    // Automatically expand all floorplans on load
                    const initialExpanded = {};
                    fetchedFloorplans.forEach(fp => {
                        initialExpanded[fp.id] = true;
                    });
                    setExpandedFloorplans(initialExpanded);
                }
                setLoading(false);
                // Set existing images and video
                setExistingImages(Array.isArray(data.image_paths) ? data.image_paths : []);
                setExistingVideo(data.video_path || '');
            } catch (error) {
                console.error("Failed to fetch listing data", error);
                setLoading(false);
            }
        };

        fetchListingData();
    }, [listingId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        setImages([...e.target.files]);
    };

    const handleVideoChange = (e) => {
        setVideo(e.target.files[0]);
    };

    const toggleTag = (tag) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else if (selectedTags.length < 5) {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const handleFloorplanChange = (fpId, field, value) => {
        setFloorplans(floorplans.map(fp => fp.id === fpId ? { ...fp, [field]: value } : fp));
    };

    const addFloorplan = () => {
        const newId = `fp-${Date.now()}`;
        setFloorplans([...floorplans, { id: newId, name: '', beds: '', baths: '', sqft: '', units: [{ id: `unit-${Date.now()}`, name: '', price: '', availability: true }] }]);
        setExpandedFloorplans(prev => ({ ...prev, [newId]: true }));
    };
    
    const removeFloorplan = (fpId) => {
        setFloorplans(floorplans.filter(fp => fp.id !== fpId));
    };

    const handleUnitChange = (fpId, unitId, field, value) => {
        setFloorplans(floorplans.map(fp => {
            if (fp.id === fpId) {
                const updatedUnits = fp.units.map(unit => unit.id === unitId ? { ...unit, [field]: value } : unit);
                return { ...fp, units: updatedUnits };
            }
            return fp;
        }));
    };

    const addUnitToFloorplan = (fpId) => {
        setFloorplans(floorplans.map(fp => {
            if (fp.id === fpId) {
                const newUnit = { id: `unit-${Date.now()}`, name: '', price: '', availability: true };
                return { ...fp, units: [...fp.units, newUnit] };
            }
            return fp;
        }));
    };

    const removeUnitFromFloorplan = (fpId, unitId) => {
        setFloorplans(floorplans.map(fp => {
            if (fp.id === fpId) {
                return { ...fp, units: fp.units.filter(unit => unit.id !== unitId) };
            }
            return fp;
        }));
    };

    const toggleFloorplan = (fpId) => {
        setExpandedFloorplans(prev => ({ ...prev, [fpId]: !prev[fpId] }));
    };

    const handleRemoveExistingImage = (filename) => {
        setExistingImages(existingImages.filter(img => img !== filename));
    };

    const handleRemoveExistingVideo = () => {
        setExistingVideo('');
    };

    // Update moveImageUp and moveImageDown to work for all images (existing + new)
    const moveImageUp = (idx) => {
        if (idx === 0) return;
        const combined = [...existingImages, ...images];
        [combined[idx - 1], combined[idx]] = [combined[idx], combined[idx - 1]];
        const newExisting = combined.filter(img => typeof img === 'string');
        const newImages = combined.filter(img => typeof img !== 'string');
        setExistingImages(newExisting);
        setImages(newImages);
    };
    const moveImageDown = (idx) => {
        const combined = [...existingImages, ...images];
        if (idx === combined.length - 1) return;
        [combined[idx], combined[idx + 1]] = [combined[idx + 1], combined[idx]];
        const newExisting = combined.filter(img => typeof img === 'string');
        const newImages = combined.filter(img => typeof img !== 'string');
        setExistingImages(newExisting);
        setImages(newImages);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert("You must be logged in to edit a listing.");
            return;
        }
        setSubmitting(true);
        setError("");
        let imageUrls = [...existingImages];
        let videoUrl = existingVideo || null;

        // 1. Upload new images to Supabase Storage
        if (images.length > 0) {
            for (let img of images) {
                const fileExt = img.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
                const { data, error: uploadError } = await supabase.storage.from('listings').upload(fileName, img);
                if (uploadError) {
                    setError('Image upload failed: ' + uploadError.message);
                    setSubmitting(false);
                    return;
                }
                // Get public URL
                const { data: publicUrlData } = supabase.storage.from('listings').getPublicUrl(fileName);
                imageUrls.push(publicUrlData.publicUrl);
            }
        }

        // 2. Upload new video to Supabase Storage (if changed)
        if (video) {
            const fileExt = video.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
            const { data, error: uploadError } = await supabase.storage.from('listing-videos').upload(fileName, video);
            if (uploadError) {
                setError('Video upload failed: ' + uploadError.message);
                setSubmitting(false);
                return;
            }
            // Get public URL
            const { data: publicUrlData } = supabase.storage.from('listing-videos').getPublicUrl(fileName);
            videoUrl = publicUrlData.publicUrl;
        }

        // 3. Prepare payload for backend
        const payload = {
            ...form,
            agent_id: currentUser.id,
            tags: selectedTags.join(','),
            image_paths: imageUrls,
            video_path: videoUrl,
        };
        if (form.listing_type === 'complex') {
            const floorplansForBackend = floorplans.map(fp => {
                const unitPrices = fp.units.map(u => parseFloat(u.price)).filter(p => !isNaN(p));
                return {
                    ...fp,
                    price_min: unitPrices.length > 0 ? Math.min(...unitPrices) : 0,
                    price_max: unitPrices.length > 0 ? Math.max(...unitPrices) : 0,
                };
            });
            payload.units = floorplansForBackend;
        }

        try {
            await axios.put(API_ENDPOINTS.UPDATE_LISTING(listingId), payload, {
                headers: { 'Content-Type': 'application/json' },
            });
            navigate('/agent-dashboard');
        } catch (error) {
            console.error('Error updating listing:', error);
            setError('Failed to update listing. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="text-center py-10">Loading listing data...</div>;
    }

    return (
        <div className="bg-gray-50 min-h-screen py-12">
            <div className="max-w-4xl mx-auto px-4">
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">Edit Listing</h1>
                    <p className="text-gray-500 mb-8">Update the details of your property listing.</p>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Listing Type Selector */}
                        <div>
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><FiTag /> Listing Type</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <label className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${form.listing_type === 'individual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <input
                                        type="radio"
                                        name="listing_type"
                                        value="individual"
                                        checked={form.listing_type === 'individual'}
                                        onChange={handleChange}
                                        className="sr-only"
                                    />
                                    <div className="text-center">
                                        <div className="font-semibold text-gray-900">Individual Unit</div>
                                        <div className="text-sm text-gray-500">Single property listing</div>
                                    </div>
                                </label>
                                <label className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${form.listing_type === 'complex' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    <input
                                        type="radio"
                                        name="listing_type"
                                        value="complex"
                                        checked={form.listing_type === 'complex'}
                                        onChange={handleChange}
                                        className="sr-only"
                                    />
                                    <div className="text-center">
                                        <div className="font-semibold text-gray-900">Complex Building</div>
                                        <div className="text-sm text-gray-500">Multiple units available</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Basic Info */}
                        <div>
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-700"><FiTag /> Basic Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <input name="title" value={form.title} onChange={handleChange} required placeholder="Title" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                </div>
                                {form.listing_type === 'individual' && (
                                     <input type="number" name="price" value={form.price} onChange={handleChange} required placeholder="Price" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                )}
                                <input name="state" value={form.state} onChange={handleChange} required placeholder="State (e.g., Lagos)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                <input name="city" value={form.city} onChange={handleChange} required placeholder="City (e.g., Ikeja)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                <input name="area" value={form.area} onChange={handleChange} required placeholder="Area (e.g., Opebi)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                <div className="md:col-span-2">
                                     <input name="address" value={form.address} onChange={handleChange} placeholder="Street Address (Optional)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                </div>

                                <div className="relative">
                                    <input type="date" name="availability_date" value={form.availability_date} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                    <label className="absolute top-0 left-3 -mt-2 px-1 bg-white text-gray-400 text-xs">Available From</label>
                                </div>

                                {form.listing_type === 'individual' && (
                                    <>
                                        <input type="number" name="bedrooms" value={form.bedrooms} onChange={handleChange} required placeholder="Bedrooms" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                        <input type="number" name="bathrooms" step="0.5" value={form.bathrooms} onChange={handleChange} required placeholder="Bathrooms" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Rent Period */}
                        <div>
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><FiClock /> Rent Period</h3>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="rent_period" value="month" checked={form.rent_period === 'month'} onChange={handleChange} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                                    Per Month
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="rent_period" value="year" checked={form.rent_period === 'year'} onChange={handleChange} className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                                    Per Year
                                </label>
                            </div>
                        </div>

                        {/* Units Section for Complex Buildings */}
                        {form.listing_type === 'complex' && (
                            <div className="border-t pt-6 space-y-4">
                                <h3 className="text-xl font-bold text-gray-800">Floorplans & Units</h3>
                                {floorplans.map((fp) => (
                                    <div key={fp.id} className="border rounded-lg bg-gray-50/50">
                                        <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100" onClick={() => toggleFloorplan(fp.id)}>
                                            <h4 className="font-semibold text-lg">{fp.name || 'Unnamed Floorplan'}</h4>
                                            <div className="flex items-center gap-4">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); removeFloorplan(fp.id); }} className="text-red-500 hover:text-red-700 p-1"><FiTrash2 /></button>
                                                {expandedFloorplans[fp.id] ? <FiChevronUp /> : <FiChevronDown />}
                                            </div>
                                        </div>
                                        {expandedFloorplans[fp.id] && (
                                            <div className="p-4 border-t space-y-4">
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <input type="text" placeholder="Floorplan Name" value={fp.name} onChange={(e) => handleFloorplanChange(fp.id, 'name', e.target.value)} className="p-2 border rounded" />
                                                    <input type="number" placeholder="Beds" value={fp.beds} onChange={(e) => handleFloorplanChange(fp.id, 'beds', e.target.value)} className="p-2 border rounded" />
                                                    <input type="number" placeholder="Baths" value={fp.baths} onChange={(e) => handleFloorplanChange(fp.id, 'baths', e.target.value)} className="p-2 border rounded" />
                                                    <input type="number" placeholder="sqft (optional)" value={fp.sqft} onChange={(e) => handleFloorplanChange(fp.id, 'sqft', e.target.value)} className="p-2 border rounded placeholder-gray-400" />
                                                </div>
                                                <h5 className="font-semibold pt-2">Individual Units</h5>
                                                <div className="space-y-2">
                                                    {fp.units.map(unit => (
                                                        <div key={unit.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center bg-white p-2 rounded border">
                                                            <input type="text" placeholder="Unit #" value={unit.name} onChange={(e) => handleUnitChange(fp.id, unit.id, 'name', e.target.value)} className="p-2 border rounded" />
                                                            <input type="number" placeholder="Price (₦)" value={unit.price} onChange={(e) => handleUnitChange(fp.id, unit.id, 'price', e.target.value)} className="p-2 border rounded" />
                                                            <label className="flex items-center gap-2 justify-center p-2 border rounded cursor-pointer hover:bg-gray-50">
                                                                <input type="checkbox" checked={unit.availability} onChange={(e) => handleUnitChange(fp.id, unit.id, 'availability', e.target.checked)} className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500" />
                                                                Available
                                                            </label>
                                                            <button type="button" onClick={() => removeUnitFromFloorplan(fp.id, unit.id)} className="text-red-500 justify-self-end p-2"><FiTrash2 /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => addUnitToFloorplan(fp.id)} className="w-full mt-2 p-2 border-2 border-dashed rounded-lg text-sm flex items-center justify-center gap-2 hover:border-blue-500 hover:text-blue-600">
                                                    <FiPlus /> Add Unit
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <button type="button" onClick={addFloorplan} className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center gap-2 font-semibold hover:border-green-400 hover:text-green-600">
                                    <FiPlus /> Add Floorplan
                                </button>
                            </div>
                        )}

                        <div>
                            <textarea name="description" value={form.description} onChange={handleChange} required placeholder="Description" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 min-h-[90px]" />
                        </div>

                        {/* Tag Selector */}
                        <div>
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><FiTag /> Tags <span className="text-xs text-gray-400">(up to 5)</span></h3>
                            <div className="flex flex-wrap gap-2">
                                {TAG_OPTIONS.map(tag => (
                                    <button
                                        type="button"
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={`px-3 py-1 rounded-full text-sm border font-medium transition-colors duration-150 ${selectedTags.includes(tag)
                                            ? 'bg-blue-600 text-white border-blue-600 shadow'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50'}
                                        `}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                            {selectedTags.length === 5 && (
                                <p className="text-xs text-green-600 mt-1">You've selected the maximum of 5 tags.</p>
                            )}
                        </div>

                        {/* Media Uploads */}
                        <div>
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><FiImage /> Images & <FiVideo /> Video</h3>
                            {/* Combined image preview and ordering controls */}
                            {existingImages.length + images.length > 0 && (
                                <div className="mt-2 mb-2">
                                    <div className="mb-2 text-sm text-gray-600">Order your images as they will appear in the listing:</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                        {[...existingImages, ...images].map((img, idx) => (
                                            <div key={typeof img === 'string' ? img : idx} className="relative border rounded-lg overflow-hidden shadow bg-white flex flex-col items-center p-2">
                                                {typeof img === 'string' ? (
                                                    <img
                                                        src={img}
                                                        alt={`Existing Preview ${idx + 1}`}
                                                        className="w-full h-24 object-cover rounded mb-2"
                                                    />
                                                ) : (
                                                    <img
                                                        src={URL.createObjectURL(img)}
                                                        alt={`Preview ${idx + 1}`}
                                                        className="w-full h-24 object-cover rounded mb-2"
                                                    />
                                                )}
                                                <div className="flex gap-1">
                                                    <button type="button" onClick={() => moveImageUp(idx)} disabled={idx === 0} className={`p-1 rounded ${idx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-blue-100'}`}
                                                        title="Move Up">
                                                        <FiChevronUp />
                                                    </button>
                                                    <button type="button" onClick={() => moveImageDown(idx)} disabled={idx === existingImages.length + images.length - 1} className={`p-1 rounded ${idx === existingImages.length + images.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-blue-100'}`}
                                                        title="Move Down">
                                                        <FiChevronDown />
                                                    </button>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">{`#${idx + 1}`}</div>
                                                {/* Remove button for each image */}
                                                {typeof img === 'string' ? (
                                                    <button type="button" onClick={() => handleRemoveExistingImage(img)} className="absolute top-1 right-1 bg-white/80 text-red-600 rounded-full p-1 shadow hover:scale-110 transition">&times;</button>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <label className="block font-medium mb-1">Upload Images</label>
                            <input type="file" multiple accept="image/*" onChange={handleImageChange} className="w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                            {/* Existing Video */}
                            {existingVideo && (
                                <div className="relative mt-4 mb-2">
                                    <video src={existingVideo} controls className="h-28 w-48 rounded border" />
                                    <button type="button" onClick={handleRemoveExistingVideo} className="absolute top-1 right-1 bg-white/80 text-red-600 rounded-full p-1 shadow hover:scale-110 transition">&times;</button>
                                </div>
                            )}
                            <label className="block font-medium mt-4 mb-1">Upload Video (optional)</label>
                            <input type="file" accept="video/*" onChange={handleVideoChange} className="w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        </div>

                        {/* Optional Fields */}
                        <div>
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><FiTag /> Additional Details</h3>
                            <textarea name="amenities" value={form.amenities} onChange={handleChange} placeholder="Amenities (optional)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 min-h-[60px]" rows={2}></textarea>
                            <textarea name="interior_features" value={form.interior_features} onChange={handleChange} placeholder="Interior Features (optional)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 min-h-[60px]" rows={2}></textarea>
                            <textarea name="exterior_features" value={form.exterior_features} onChange={handleChange} placeholder="Exterior Features (optional)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 min-h-[60px]" rows={2}></textarea>
                            <textarea name="leasing_terms" value={form.leasing_terms} onChange={handleChange} placeholder="Leasing Terms (optional)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 min-h-[60px]" rows={2}></textarea>
                            <textarea name="policy" value={form.policy} onChange={handleChange} placeholder="Policy (optional)" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200 min-h-[60px]" rows={2}></textarea>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                            >
                                <FiSave />
                                {submitting ? 'Updating...' : 'Update Listing'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default EditListing;


