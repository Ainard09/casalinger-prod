import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FiUser, FiMail, FiPhone, FiMapPin, FiEdit } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';

const AgentProfile = () => {
    const { currentUser } = useContext(AuthContext);
    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAgent = async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            const token = session?.access_token;
            if (!token) return;
            setLoading(true);
            try {
                const res = await fetch('http://127.0.0.1:5000/api/agent/profile', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setAgent(data);
                } else {
                    setAgent(null);
                }
            } catch {
                setAgent(null);
            } finally {
                setLoading(false);
            }
        };
        fetchAgent();
    }, [currentUser]);

    const formatAgentType = (type) => {
        if (!type) return '';
        return type
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    if (loading) return <p>Loading...</p>;
    if (!agent) return <p>Agent not found.</p>;

    return (
        <div className="min-h-screen bg-gray-50 pt-12">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="md:flex">
                    {/* Left Side - Photo */}
                    <div className="md:w-1/3 bg-gray-100 p-8 flex flex-col items-center justify-center">
                        <img 
                            src={agent.photo_url ? agent.photo_url : 'https://via.placeholder.com/150'} 
                            alt="Profile" 
                            className="w-40 h-40 rounded-full object-cover border-4 border-white shadow-md"
                        />
                        <h2 className="text-2xl font-bold mt-4 text-gray-800">{agent.name}</h2>
                        <p className="text-md text-gray-500">{agent.agent_type === 'company' ? 'Management Company' : formatAgentType(agent.agent_type)}</p>
                        <Link 
                            to="/agent/edit-profile" 
                            className="mt-6 inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition"
                        >
                            <FiEdit className="mr-2 -ml-1 h-5 w-5" />
                            Edit Profile
                        </Link>
                    </div>

                    {/* Right Side - Details */}
                    <div className="md:w-2/3 p-8">
                        <h3 className="text-2xl font-semibold text-gray-800 mb-6">Profile Details</h3>
                        <div className="space-y-6">
                            <div className="flex items-center">
                                <FiMail className="w-6 h-6 text-gray-400" />
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Email</p>
                                    <p className="text-lg text-gray-800">{agent.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <FiPhone className="w-6 h-6 text-gray-400" />
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Phone</p>
                                    <p className="text-lg text-gray-800">{agent.phone || 'Not provided'}</p>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <FiMapPin className="w-6 h-6 text-gray-400" />
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Business Address</p>
                                    <p className="text-lg text-gray-800">{agent.address || 'Not provided'}</p>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <span className="w-6 h-6 text-gray-400 font-bold flex items-center justify-center">🌐</span>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Languages</p>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {(agent.languages ? agent.languages.split(',') : []).filter(Boolean).length > 0 ? (
                                            agent.languages.split(',').map((lang, i) => (
                                                <span key={i} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">{lang}</span>
                                            ))
                                        ) : (
                                            <span className="text-gray-400">Not provided</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <span className="w-6 h-6 text-gray-400 font-bold flex items-center justify-center">⭐</span>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-500">Specialty</p>
                                    <p className="text-lg text-gray-800">{agent.specialty ? formatAgentType(agent.specialty.replace('_', ' & ')) : 'Not provided'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentProfile; 