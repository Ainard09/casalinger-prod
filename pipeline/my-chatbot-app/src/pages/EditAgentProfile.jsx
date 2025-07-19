import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FiUser, FiMail, FiPhone, FiMapPin, FiCamera } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';

const EditAgentProfile = () => {
    const { currentUser, setCurrentUser } = useContext(AuthContext);
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        street: '',
        city: '',
        state: '',
    });
    const [languages, setLanguages] = useState(['']);
    const [specialty, setSpecialty] = useState('rental');
    const [photo, setPhoto] = useState(null);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [photoUrl, setPhotoUrl] = useState(null);

    useEffect(() => {
        const fetchAgent = async () => {
            if (!currentUser?.id) return;
            try {
                const res = await fetch(`http://127.0.0.1:5000/api/agent/profile/update?agent_id=${currentUser.id}`);
                if (res.ok) {
                    const data = await res.json();
                    let street = '', city = '', state = '';
                    if (data.address) {
                        const parts = data.address.split(',').map(s => s.trim());
                        [street, city, state] = parts;
                    }
                    setForm({
                        name: data.name || '',
                        email: data.email || '',
                        phone: data.phone || '',
                        street: street || '',
                        city: city || '',
                        state: state || '',
                    });
                    setLanguages(data.languages ? data.languages.split(',') : ['']);
                    setSpecialty(data.specialty || 'rental');
                    if (data.photo_url) {
                        setPhotoUrl(data.photo_url);
                        setPreview(data.photo_url);
                    }
                }
            } catch (err) {
                // Optionally handle error
            }
        };
        fetchAgent();
    }, [currentUser]);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhoto(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const handleLanguageChange = (idx, value) => {
        const updated = [...languages];
        updated[idx] = value;
        setLanguages(updated);
    };

    const addLanguage = () => {
        if (languages.length < 3) setLanguages([...languages, '']);
    };

    const removeLanguage = (idx) => {
        if (languages.length > 1) setLanguages(languages.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        let uploadedPhotoUrl = photoUrl;
        if (photo) {
            const fileExt = photo.name.split('.').pop();
            const fileName = `agent_${Date.now()}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('agent-profiles')
                .upload(fileName, photo);
            if (uploadError) {
                setError('Failed to upload photo: ' + uploadError.message);
                return;
            }
            const { data: publicUrlData } = supabase
                .storage
                .from('agent-profiles')
                .getPublicUrl(fileName);
            uploadedPhotoUrl = publicUrlData.publicUrl;
        }
        const address = `${form.street}, ${form.city}, ${form.state}`;
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        const token = session?.access_token;
        const payload = {
            name: form.name,
            email: form.email,
            phone: form.phone,
            address,
            agent_id: currentUser.id,
            languages: languages.filter(l => l.trim()),
            specialty,
            photo_url: uploadedPhotoUrl
        };
        try {
            const res = await fetch('http://127.0.0.1:5000/api/agent/profile/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Failed to update profile.");
            }
            setCurrentUser(prevUser => ({
                ...prevUser,
                ...data.agent,
            }));
            setSuccess('Profile updated successfully!');
            setTimeout(() => navigate('/agent/dashboard'), 2000);
        } catch (err) {
            setError(err.message);
        }
    };

    if (!currentUser) {
        return <p>Loading...</p>;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-lg">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Edit Your Profile
                    </h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div className="flex items-center justify-center mb-6">
                            <div className="relative">
                                <img 
                                    src={preview || photoUrl || `https://via.placeholder.com/150`} 
                                    alt="Profile" 
                                    className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                                />
                                <label htmlFor="photo-upload" className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 transition">
                                    <FiCamera />
                                    <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handlePhotoChange} accept="image/*" />
                                </label>
                            </div>
                        </div>

                        {error && <p className="text-red-500 text-sm text-center my-4">{error}</p>}
                        {success && <p className="text-green-500 text-sm text-center my-4">{success}</p>}

                        <div className="relative">
                            <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input id="name" name="name" type="text" required className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Full Name" value={form.name} onChange={handleChange} />
                        </div>
                        <div className="relative pt-4">
                            <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                id="email"
                                name="email"
                                type="email"
                                disabled
                                className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 bg-gray-100 cursor-not-allowed sm:text-sm"
                                placeholder="Email Address"
                                value={form.email}
                            />
                        </div>
                        <div className="relative pt-4">
                            <FiPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input id="phone" name="phone" type="tel" className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Phone Number" value={form.phone} onChange={handleChange} />
                        </div>
                        <div className="relative pt-4">
                            <input id="street" name="street" type="text" className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Street Address" value={form.street} onChange={handleChange} required />
                        </div>
                        <div className="relative pt-4">
                            <input id="city" name="city" type="text" className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="City" value={form.city} onChange={handleChange} required />
                        </div>
                        <div className="relative pt-4">
                            <input id="state" name="state" type="text" className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="State" value={form.state} onChange={handleChange} required />
                        </div>
                        <div className="relative pt-4">
                            <label className="block font-medium text-sm mb-1">Languages Spoken (max 3)</label>
                            {languages.map((lang, idx) => (
                                <div key={idx} className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        value={lang}
                                        onChange={e => handleLanguageChange(idx, e.target.value)}
                                        className="w-full border rounded p-2"
                                        placeholder={`Language ${idx + 1}`}
                                        required={idx === 0}
                                    />
                                    {languages.length > 1 && (
                                        <button type="button" onClick={() => removeLanguage(idx)} className="text-red-500 font-bold px-2">×</button>
                                    )}
                                </div>
                            ))}
                            {languages.length < 3 && (
                                <button type="button" onClick={addLanguage} className="text-blue-600 text-sm font-medium">+ Add Language</button>
                            )}
                        </div>
                        <div className="relative pt-4">
                            <label className="block font-medium text-sm mb-1">Specialty</label>
                            <select
                                name="specialty"
                                className="w-full border rounded p-2"
                                value={specialty}
                                onChange={e => setSpecialty(e.target.value)}
                                required
                            >
                                <option value="rental">Rental</option>
                                <option value="shortlet">Shortlet</option>
                                <option value="rental_shortlet">Rental & Shortlet</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <button type="submit" className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditAgentProfile; 