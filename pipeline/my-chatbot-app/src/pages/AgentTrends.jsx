import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FiTrendingUp, FiDownload, FiInfo } from 'react-icons/fi';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { saveAs } from 'file-saver';

const COLORS = {
    light: ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA'],
    dark: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
};

const TAG_COLORS = {
    'Security': '#EF4444',
    'Garden': '#10B981',
    'Luxury': '#F59E0B',
    'Modern': '#3B82F6',
    'Spacious': '#8B5CF6',
    'Family': '#EC4899',
    'Pet-Friendly': '#14B8A6',
    'Gated': '#F97316',
    'Waterfront': '#0EA5E9',
    'Smart': '#6366F1'
};

const AgentTrends = () => {
    const { currentUser } = useContext(AuthContext);
    const [trends, setTrends] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('tags');
    const [darkMode, setDarkMode] = useState(() => 
        localStorage.getItem('darkMode') === 'true'
    );

    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
        localStorage.setItem('darkMode', darkMode);
    }, [darkMode]);

    useEffect(() => {
        if (!currentUser) return;
        fetchTrends();
    }, [currentUser]);

    const fetchTrends = async () => {
        try {
            const res = await fetch(
                `http://127.0.0.1:5000/api/agent/${currentUser.id}/trends`
            );
            
            if (!res.ok) throw new Error('Failed to fetch trends data');
            
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            setTrends(data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to load trends:", err);
            setError(err.message);
            setLoading(false);
        }
    };

    const exportToCSV = () => {
        if (!trends) return;

        const csvData = {
            'Tag Trends': Object.entries(trends.tag_trends).map(([tag, count]) => ({ tag, count })),
            'Area Demand': Object.entries(trends.area_demand).map(([area, count]) => ({ area, count })),
            'Bedroom Demand': Object.entries(trends.bedroom_demand).map(([bedrooms, count]) => ({ bedrooms, count }))
        };

        const csv = Object.entries(csvData).map(([category, data]) => {
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(row => Object.values(row).join(',')).join('\n');
            return `${category}\n${headers}\n${rows}`;
        }).join('\n\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        saveAs(blob, 'property_trends.csv');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Error Loading Trends</h2>
                    <p className="mt-2 text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    const colorScheme = darkMode ? COLORS.dark : COLORS.light;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            📈 Property Trends
                        </h1>
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={exportToCSV}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title="Export to CSV"
                            >
                                <FiDownload className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                {darkMode ? 
                                    <FiSun className="w-5 h-5 text-gray-400" /> : 
                                    <FiMoon className="w-5 h-5 text-gray-600" />
                                }
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="flex space-x-4 mb-6">
                    <button
                        onClick={() => setActiveTab('tags')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            activeTab === 'tags'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                    >
                        Tag Trends
                    </button>
                    <button
                        onClick={() => setActiveTab('areas')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            activeTab === 'areas'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                    >
                        Area Demand
                    </button>
                    <button
                        onClick={() => setActiveTab('bedrooms')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            activeTab === 'bedrooms'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                    >
                        Bedroom Demand
                    </button>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Tag Trends */}
                    {activeTab === 'tags' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                Popular Property Tags
                            </h2>
                            <div className="h-96">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={Object.entries(trends.tag_trends).map(([tag, count]) => ({
                                            tag,
                                            count
                                        }))}
                                        layout="vertical"
                                        margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
                                        <XAxis type="number" tick={{ fill: darkMode ? '#D1D5DB' : '#374151' }} />
                                        <YAxis
                                            dataKey="tag"
                                            type="category"
                                            tick={{ fill: darkMode ? '#D1D5DB' : '#374151' }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: darkMode ? '#1F2937' : 'white',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                            }}
                                            labelStyle={{ color: darkMode ? '#D1D5DB' : '#374151' }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill={colorScheme[0]}
                                            name="Interactions"
                                        >
                                            {Object.entries(trends.tag_trends).map(([tag], index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={TAG_COLORS[tag] || colorScheme[index % colorScheme.length]}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Area Demand */}
                    {activeTab === 'areas' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                Area Demand Heatmap
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {Object.entries(trends.area_demand).map(([area, count]) => {
                                    const maxCount = Math.max(...Object.values(trends.area_demand));
                                    const intensity = count / maxCount;
                                    return (
                                        <div
                                            key={area}
                                            className="p-4 rounded-lg transition-all duration-200 transform hover:scale-105"
                                            style={{
                                                background: `linear-gradient(135deg, ${colorScheme[0]}${Math.round(intensity * 255).toString(16).padStart(2, '0')}, ${colorScheme[1]}${Math.round(intensity * 255).toString(16).padStart(2, '0')})`
                                            }}
                                        >
                                            <h3 className="text-white font-semibold">{area}</h3>
                                            <p className="text-white opacity-90">{count} interactions</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Bedroom Demand */}
                    {activeTab === 'bedrooms' && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                                Bedroom Demand
                            </h2>
                            <div className="h-96">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={Object.entries(trends.bedroom_demand).map(([bedrooms, count]) => ({
                                            bedrooms: `${bedrooms} BR`,
                                            count
                                        }))}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#E5E7EB'} />
                                        <XAxis
                                            dataKey="bedrooms"
                                            tick={{ fill: darkMode ? '#D1D5DB' : '#374151' }}
                                        />
                                        <YAxis tick={{ fill: darkMode ? '#D1D5DB' : '#374151' }} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: darkMode ? '#1F2937' : 'white',
                                                border: 'none',
                                                borderRadius: '0.5rem',
                                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                            }}
                                            labelStyle={{ color: darkMode ? '#D1D5DB' : '#374151' }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill={colorScheme[0]}
                                            name="Interactions"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentTrends; 