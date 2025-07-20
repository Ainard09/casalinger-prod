import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FiUpload, FiTag, FiImage, FiVideo, FiHome, FiPlus, FiTrash2, FiEdit, FiChevronDown, FiChevronUp, FiCopy, FiMapPin, FiClock } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';
import { API_ENDPOINTS } from '../utils/config';

const TAG_OPTIONS = [
    "Luxury", "Modern", "Coastal", "Security", "Garden", "Ocean View", "Duplex", "Stable Light",
    "Family-friendly", "Quiet", "Smart Home", "Pet Friendly", "Urban", "Green Energy"
];

const PostListing = () => {
    const { currentUser } = useContext(AuthContext);
    const navigate = useNavigate();

    const [form, setForm] = useState({
        title: '',
        description: '',
        price: '',
        state: '',
        city: '',
        area: '',
        address: '',
        bedrooms: '',
        bathrooms: '',
        sqft: '',
        availability_date: '',
        amenities: '',
        interior_features: '',
        exterior_features: '',
        leasing_terms: '',
        policy: '',
        listing_type: 'individual',
        rent_period: 'year'
    });

    const [images, setImages] = useState([]);
    const [video, setVideo] = useState(null);
    const [selectedTags, setSelectedTags] = useState([]);
    const [error, setError] = useState('');
    const [floorplans, setFloorplans] = useState([]);
    const [expandedFloorplans, setExpandedFloorplans] = useState({});

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
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

    // Floorplan and Unit Management
    const addFloorplan = () => {
        const newId = `fp_${Date.now()}`;
        setFloorplans([...floorplans, {
            id: newId,
            name: '',
            bedrooms: '',
            bathrooms: '',
            sqft: '',
            units: []
        }]);
        setExpandedFloorplans({ ...expandedFloorplans, [newId]: true });
    };

    const updateFloorplan = (fpId, field, value) => {
        setFloorplans(floorplans.map(fp => fp.id === fpId ? { ...fp, [field]: value } : fp));
    };

    const removeFloorplan = (fpId) => {
        setFloorplans(floorplans.filter(fp => fp.id !== fpId));
    };

    const addUnitToFloorplan = (fpId) => {
        const newUnit = { id: `u_${Date.now()}`, name: '', price: '', is_available: true };
        setFloorplans(floorplans.map(fp => 
            fp.id === fpId ? { ...fp, units: [...fp.units, newUnit] } : fp
        ));
    };

    const updateUnitInFloorplan = (fpId, unitId, field, value) => {
        setFloorplans(floorplans.map(fp => 
            fp.id === fpId 
                ? { ...fp, units: fp.units.map(u => u.id === unitId ? { ...u, [field]: value } : u) } 
                : fp
        ));
    };

    const removeUnitFromFloorplan = (fpId, unitId) => {
        setFloorplans(floorplans.map(fp => 
            fp.id === fpId ? { ...fp, units: fp.units.filter(u => u.id !== unitId) } : fp
        ));
    };

    const toggleFloorplan = (fpId) => {
        setExpandedFloorplans({ ...expandedFloorplans, [fpId]: !expandedFloorplans[fpId] });
    };

    // Update moveImageUp and moveImageDown to work for all images
    const moveImageUp = (idx) => {
        if (idx === 0) return;
        setImages(prev => {
            const arr = [...prev];
            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
            return arr;
        });
    };
    const moveImageDown = (idx) => {
        if (idx === images.length - 1) return;
        setImages(prev => {
            const arr = [...prev];
            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
            return arr;
        });
    };

    // Add delete image functionality
    const deleteImage = (idx) => {
        setImages(prev => prev.filter((_, index) => index !== idx));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");
        let imageUrls = [];
        let videoUrl = null;

        // 1. Upload images to Supabase Storage
        if (images.length > 0) {
            for (let img of images) {
                const fileExt = img.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
                const { data, error: uploadError } = await supabase.storage.from('listings').upload(fileName, img);
                if (uploadError) {
                    setError('Image upload failed: ' + uploadError.message);
                    return;
                }
                // Get public URL
                const { data: publicUrlData } = supabase.storage.from('listings').getPublicUrl(fileName);
                imageUrls.push(publicUrlData.publicUrl);
            }
        }

        // 2. Upload video to Supabase Storage
        if (video) {
            const fileExt = video.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
            const { data, error: uploadError } = await supabase.storage.from('listing-videos').upload(fileName, video);
            if (uploadError) {
                setError('Video upload failed: ' + uploadError.message);
                return;
            }
            // Get public URL
            const { data: publicUrlData } = supabase.storage.from('listing-videos').getPublicUrl(fileName);
            videoUrl = publicUrlData.publicUrl;
        }

        // 3. Prepare payload for backend
        const payload = {
            ...form,
            agent_id: currentUser?.id,
            tags: selectedTags.join(','),
            image_paths: imageUrls,
            video_path: videoUrl,
        };
        if (form.listing_type === 'complex' && floorplans.length > 0) {
            const unitsForBackend = floorplans.flatMap(fp => {
                if (fp.units.length === 0) return [];
                if (fp.units.length === 1 && !fp.units[0].name) {
                    return [{
                        name: fp.name,
                        bedrooms: fp.bedrooms,
                        bathrooms: fp.bathrooms,
                        sqft: fp.sqft,
                        price_min: fp.units[0].price,
                        price_max: fp.units[0].price,
                        is_available: fp.units[0].is_available
                    }];
                }
                const unitPrices = fp.units.map(u => parseFloat(u.price)).filter(p => !isNaN(p));
                const summary = {
                    name: fp.name,
                    bedrooms: fp.bedrooms,
                    bathrooms: fp.bathrooms,
                    sqft: fp.sqft,
                    price_min: unitPrices.length > 0 ? Math.min(...unitPrices) : 0,
                    price_max: unitPrices.length > 0 ? Math.max(...unitPrices) : 0,
                    is_available: fp.units.some(u => u.is_available)
                };
                const individualUnits = fp.units.map(u => ({
                    name: `${fp.name} - ${u.name}`,
                    bedrooms: fp.bedrooms,
                    bathrooms: fp.bathrooms,
                    sqft: fp.sqft,
                    price_min: u.price,
                    price_max: u.price,
                    is_available: u.is_available
                }));
                return [summary, ...individualUnits];
            });
            payload.units = unitsForBackend;
        }

        try {
            const res = await fetch(API_ENDPOINTS.CREATE_LISTING, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Upload failed');
            }
            alert('Listing uploaded successfully!');
            navigate('/agent/dashboard');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen py-10">
            <div className="max-w-4xl mx-auto px-4">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
                    <div className="flex items-center mb-8">
                        <div className="bg-blue-100 text-blue-700 rounded-full p-3 mr-4">
                            <FiHome className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-1">Post a New Listing</h2>
                            <p className="text-gray-500 text-sm">Fill in the details below to add a new property to your portfolio.</p>
                        </div>
                    </div>

                    {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

                    <form onSubmit={handleSubmit} className="space-y-6" encType="multipart/form-data">
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
                            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><FiTag /> Basic Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <input name="title" value={form.title} onChange={handleChange} required placeholder="Title" className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-200" />
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
                            <div className="border-t pt-6">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-gray-800">Available Units & Floorplans</h3>
                                <div className="space-y-4">
                                    {floorplans.map((fp, fpIndex) => (
                                        <div key={fp.id} className="border border-gray-200 rounded-lg bg-gray-50/50">
                                            <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100" onClick={() => toggleFloorplan(fp.id)}>
                                                <h4 className="font-semibold text-lg text-gray-900">Floorplan: {fp.name || 'Unnamed'}</h4>
                                                <div className="flex items-center gap-4">
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); removeFloorplan(fp.id); }} className="p-1 text-red-500 hover:text-red-700"><FiTrash2 /></button>
                                                    {expandedFloorplans[fp.id] ? <FiChevronUp /> : <FiChevronDown />}
                                                </div>
                                            </div>
                                            
                                            {expandedFloorplans[fp.id] && (
                                                <div className="p-4 border-t space-y-4">
                                                    {/* Floorplan Details */}
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                        <input type="text" value={fp.name} onChange={(e) => updateFloorplan(fp.id, 'name', e.target.value)} placeholder="Floorplan Name" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                                                        <input type="number" value={fp.bedrooms} onChange={(e) => updateFloorplan(fp.id, 'bedrooms', e.target.value)} placeholder="Beds" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                                                        <input type="number" value={fp.bathrooms} onChange={(e) => updateFloorplan(fp.id, 'bathrooms', e.target.value)} placeholder="Baths" className="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                                                        <input type="number" value={fp.sqft} onChange={(e) => updateFloorplan(fp.id, 'sqft', e.target.value)} placeholder="sqft (optional)" className="w-full p-2 border border-gray-200 rounded-lg text-sm placeholder-gray-400" />
                                                    </div>

                                                    {/* Individual Units */}
                                                    <h5 className="font-semibold text-md pt-2">Individual Units for this Floorplan</h5>
                                                    <div className="space-y-2">
                                                        {fp.units.map((unit, uIndex) => (
                                                            <div key={unit.id} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center bg-white p-2 rounded border">
                                                                <input type="text" placeholder="Unit # (e.g., 101, 'Apt B')" value={unit.name} onChange={(e) => updateUnitInFloorplan(fp.id, unit.id, 'name', e.target.value)} className="p-2 border rounded" />
                                                                <input type="number" placeholder="Price (₦)" value={unit.price} onChange={(e) => updateUnitInFloorplan(fp.id, unit.id, 'price', e.target.value)} className="p-2 border rounded" />
                                                                <label className="flex items-center gap-2 justify-center">
                                                                    <input type="checkbox" checked={unit.is_available} onChange={(e) => updateUnitInFloorplan(fp.id, unit.id, 'is_available', e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                                                                    Available
                                                                </label>
                                                                <button type="button" onClick={() => removeUnitFromFloorplan(fp.id, unit.id)} className="text-red-500 justify-self-end p-2"><FiTrash2 /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <button type="button" onClick={() => addUnitToFloorplan(fp.id)} className="w-full mt-2 p-2 border-2 border-dashed rounded-lg text-sm flex items-center justify-center gap-2 hover:border-blue-500 hover:text-blue-600">
                                                        <FiPlus /> Add Individual Unit
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={addFloorplan} className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-green-400 hover:text-green-600 transition-colors flex items-center justify-center gap-2 font-semibold">
                                        <FiPlus /> Add New Floorplan
                                    </button>
                                </div>
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
                            <label className="block font-medium mb-1">Upload Images</label>
                            <input type="file" multiple accept="image/*" onChange={handleImageChange} className="w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                            {/* Image preview and ordering controls */}
                            {images.length > 0 && (
                                <div className="mt-4">
                                    <div className="mb-2 text-sm text-gray-600">Order your images as they will appear in the listing:</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                        {images.map((img, idx) => (
                                            <div key={idx} className="relative border rounded-lg overflow-hidden shadow bg-white flex flex-col items-center p-2">
                                                <img
                                                    src={URL.createObjectURL(img)}
                                                    alt={`Preview ${idx + 1}`}
                                                    className="w-full h-24 object-cover rounded mb-2"
                                                />
                                                <div className="flex gap-1 mb-1">
                                                    <button type="button" onClick={() => moveImageUp(idx)} disabled={idx === 0} className={`p-1 rounded ${idx === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-blue-100'}`}
                                                        title="Move Up">
                                                        <FiChevronUp />
                                                    </button>
                                                    <button type="button" onClick={() => moveImageDown(idx)} disabled={idx === images.length - 1} className={`p-1 rounded ${idx === images.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-blue-100'}`}
                                                        title="Move Down">
                                                        <FiChevronDown />
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => deleteImage(idx)} 
                                                        className="p-1 rounded hover:bg-red-100 text-red-500 hover:text-red-700"
                                                        title="Delete Image"
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                </div>
                                                <div className="text-xs text-gray-500">{`#${idx + 1}`}</div>
                                            </div>
                                        ))}
                                    </div>
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

                        <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg shadow hover:bg-blue-700 transition-all">
                            <FiUpload className="inline-block mr-2 -mt-1" /> Submit Listing
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PostListing;


