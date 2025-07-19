import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';

export default function AgentOnboarding() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
        phone: '',
        agent_type: 'freelance',
        street: '',
        city: '',
        state: '',
    });
    const [photo, setPhoto] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [languages, setLanguages] = useState(['']);
    const [specialty, setSpecialty] = useState('rental');

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handlePhotoChange = (e) => {
        setPhoto(e.target.files[0]);
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
        setLoading(true);
        try {
            // Required fields check
            if (!form.name || !form.phone || !form.agent_type || !form.street || !form.city || !form.state || !specialty || languages.filter(l => l.trim()).length === 0) {
                setError('Please fill in all required fields.');
                setLoading(false);
                return;
            }
            let photoUrl = null;
            if (photo) {
                const fileExt = photo.name.split('.').pop();
                const fileName = `agent_${Date.now()}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('agent-profiles')
                    .upload(fileName, photo);
                if (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                    setError('Failed to upload photo: ' + uploadError.message);
                    setLoading(false);
                    return;
                }
                const { data: publicUrlData } = supabase
                    .storage
                    .from('agent-profiles')
                    .getPublicUrl(fileName);
                photoUrl = publicUrlData.publicUrl;
            }
            const address = `${form.street}, ${form.city}, ${form.state}`;
            // Get Supabase session for JWT
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;
            // Compose onboarding payload
            const payload = {
                fullName: form.name,
                phone: form.phone,
                agent_type: form.agent_type,
                address,
                specialty,
                languages: languages.filter(l => l.trim()),
                photo_url: photoUrl
            };
            const response = await fetch('http://127.0.0.1:5000/api/agent/onboarding', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.error || data.message || 'Registration failed.');
                setLoading(false);
                return;
            }
            // Onboarding succeeded, now fetch the latest agent profile
            const profileRes = await fetch('http://127.0.0.1:5000/api/agent/profile', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (profileRes.ok) {
                const agentData = await profileRes.json();
                const agentInfo = {
                    id: agentData.id,
                    name: agentData.name,
                    email: agentData.email,
                    supabase_id: agentData.supabase_id,
                    is_agent: true
                };
                if (window.localStorage) {
                    localStorage.setItem('currentUser', JSON.stringify(agentInfo));
                }
            }
            navigate('/agent/login');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg mt-0">
                <h2 className="text-2xl font-bold mb-4 text-center text-blue-700">Agent Registration</h2>
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        name="name"
                        placeholder="Full Name or Company Name"
                        className="w-full border rounded p-2"
                        value={form.name}
                        onChange={handleChange}
                        required
                    />
                    <input
                        type="tel"
                        name="phone"
                        placeholder="Phone Number"
                        className="w-full border rounded p-2"
                        value={form.phone}
                        onChange={handleChange}
                        required
                    />
                    <input
                        type="text"
                        name="street"
                        placeholder="Street Address"
                        className="w-full border rounded p-2"
                        value={form.street}
                        onChange={handleChange}
                        required
                    />
                    <input
                        type="text"
                        name="city"
                        placeholder="City"
                        className="w-full border rounded p-2"
                        value={form.city}
                        onChange={handleChange}
                        required
                    />
                    <input
                        type="text"
                        name="state"
                        placeholder="State"
                        className="w-full border rounded p-2"
                        value={form.state}
                        onChange={handleChange}
                        required
                    />
                    <div className="space-y-2">
                        <label className="block font-medium text-sm">Agent Type</label>
                        <select
                            name="agent_type"
                            className="w-full border rounded p-2"
                            value={form.agent_type}
                            onChange={handleChange}
                        >
                            <option value="freelance">Freelance Agent</option>
                            <option value="company">Management Company</option>
                            <option value="property_owner">Property Owner</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="block font-medium text-sm">Languages Spoken (max 3)</label>
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
                    <div className="space-y-2">
                        <label className="block font-medium text-sm">Specialty</label>
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
                    <div className="space-y-2">
                        <label className="block font-medium text-sm">Profile Photo (Optional)</label>
                        <input
                            type="file"
                            name="photo"
                            accept="image/*"
                            className="w-full border rounded p-2"
                            onChange={handlePhotoChange}
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-700 text-white py-2 rounded hover:bg-blue-800 transition"
                        disabled={loading}
                    >
                        {loading ? 'Registering...' : 'Complete Registration'}
                    </button>
                </form>
            </div>
        </div>
    );
} 