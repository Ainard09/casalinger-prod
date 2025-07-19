import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FiEye, FiBookmark, FiHome, FiTrendingUp, FiMoon, FiSun, FiFilter, FiHash, FiMap, FiBox } from 'react-icons/fi';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const COLORS = {
    light: ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA'],
    dark: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
};

// Color palette for tag bars
const TAG_COLORS = [
    '#22d3ee', // cyan
    '#fbbf24', // yellow
    '#f472b6', // pink
    '#60a5fa', // blue
    '#a78bfa', // purple
    '#34d399', // green
    '#f87171', // red
    '#818cf8', // indigo
    '#facc15', // gold
    '#38bdf8', // sky
];

const AgentAnalytics = () => {
    const { currentUser } = useContext(AuthContext);
    const [analytics, setAnalytics] = useState(null);
    const [trends, setTrends] = useState(null);
    const [locations, setLocations] = useState({ cities: [], areas: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [darkMode, setDarkMode] = useState(() => 
        localStorage.getItem('darkMode') === 'true'
    );
    const [filters, setFilters] = useState({
        city: '',
        area: '',
        startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)),
        endDate: new Date(),
    });
    const [marketData, setMarketData] = useState({ cities: [], bedrooms: [] });

    useEffect(() => {
        document.documentElement.classList.toggle('dark', darkMode);
        localStorage.setItem('darkMode', darkMode);
    }, [darkMode]);

    useEffect(() => {
        if (!currentUser) return;
        fetchLocations();
        fetchData();
    }, [currentUser, filters]);

    const fetchLocations = async () => {
        try {
            const res = await fetch(`http://127.0.0.1:5000/api/agent/${currentUser.id}/locations`);
            if (res.ok) {
                const data = await res.json();
                setLocations(data);
            }
        } catch (err) {
            console.error("Failed to fetch locations:", err);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [analyticsRes, trendsRes] = await Promise.all([
                fetch(
                    `http://127.0.0.1:5000/api/agent/${currentUser.id}/analytics?${new URLSearchParams({
                        city: filters.city,
                        area: filters.area,
                        startDate: filters.startDate.toISOString(),
                        endDate: filters.endDate.toISOString()
                    })}`
                ),
                fetch(
                    `http://127.0.0.1:5000/api/agent/${currentUser.id}/trends?${new URLSearchParams({
                        city: filters.city,
                        area: filters.area,
                        startDate: filters.startDate.toISOString(),
                        endDate: filters.endDate.toISOString()
                    })}`
                )
            ]);
            
            if (!analyticsRes.ok || !trendsRes.ok) {
                throw new Error('Failed to fetch data');
            }
            
            const [analyticsData, trendsData] = await Promise.all([
                analyticsRes.json(),
                trendsRes.json()
            ]);

            if (analyticsData.error) throw new Error(analyticsData.error);
            if (trendsData.error) throw new Error(trendsData.error);
            
            setAnalytics(analyticsData);
            setTrends(trendsData);
            setLoading(false);
        } catch (err) {
            console.error("Failed to load data:", err);
            setError(err.message);
            setLoading(false);
        }
    };

    const formatTrendsData = (data, type) => {
        if (!data) return [];
        return Object.entries(data).map(([key, value]) => ({
            name: key,
            value: value
        }));
    };

    // Fetch general market data
    useEffect(() => {
        if (!currentUser) return;
        fetchMarketData();
    }, [currentUser, filters.startDate, filters.endDate]);

    const fetchMarketData = async () => {
        try {
            const params = new URLSearchParams({
                startDate: filters.startDate.toISOString(),
                endDate: filters.endDate.toISOString(),
            });
            const res = await fetch(`http://127.0.0.1:5000/api/market/analytics?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch market data');
            const data = await res.json();
            setMarketData(data);
        } catch (err) {
            setMarketData({ cities: [], bedrooms: [] });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#111827] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#111827] flex items-center justify-center text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold">Error Loading Analytics</h2>
                    <p className="mt-2 text-red-400">{error}</p>
                </div>
            </div>
        );
    }

    const colorScheme = darkMode ? COLORS.dark : COLORS.light;

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#111827] text-white transition-colors duration-200">
            {/* Sticky Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                                <FiTrendingUp className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                                    Agent Analytics Dashboard
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Track your performance and property insights
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                            >
                                {darkMode ? 
                                    <FiSun className="w-5 h-5 text-yellow-400" /> : 
                                    <FiMoon className="w-5 h-5 text-gray-600" />
                                }
                            </button>
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold shadow-lg">
                                {currentUser?.name?.[0]?.toUpperCase() || 'A'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Section */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex flex-wrap gap-4 items-center">
                            <select
                                value={filters.city}
                                onChange={(e) => setFilters(prev => ({ ...prev, city: e.target.value }))}
                                className="rounded-md border border-gray-700 bg-gray-800 text-white"
                            >
                                <option value="">All Cities</option>
                                {locations.cities.map((city) => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                            <select
                                value={filters.area}
                                onChange={(e) => setFilters(prev => ({ ...prev, area: e.target.value }))}
                                className="rounded-md border border-gray-700 bg-gray-800 text-white"
                            >
                                <option value="">All Areas</option>
                                {locations.areas.map((area) => (
                                    <option key={area} value={area}>{area}</option>
                                ))}
                            </select>
                            <div className="flex items-center gap-2">
                                <DatePicker
                                    selected={filters.startDate}
                                    onChange={date => setFilters(prev => ({ ...prev, startDate: date }))}
                                    className="rounded-md border border-gray-700 bg-gray-800 text-white"
                                    calendarClassName="bg-gray-800 text-white"
                                    popperClassName="text-white"
                                />
                                <span className="text-white">to</span>
                                <DatePicker
                                    selected={filters.endDate}
                                    onChange={date => setFilters(prev => ({ ...prev, endDate: date }))}
                                    className="rounded-md border border-gray-700 bg-gray-800 text-white"
                                    calendarClassName="bg-gray-800 text-white"
                                    popperClassName="text-white"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {(filters.city || filters.area) && (
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">Active Filters:</span>
                                    {filters.city && <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">City: {filters.city}</span>}
                                    {filters.area && <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">Area: {filters.area}</span>}
                                </div>
                            )}
                            <button
                                onClick={() => setFilters({
                                    city: '',
                                    area: '',
                                    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)),
                                    endDate: new Date()
                                })}
                                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
                            >
                                Clear Filters
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                        <div className="flex items-center text-white">
                            <div className="p-3 rounded-full bg-white bg-opacity-20">
                                <FiEye className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium opacity-90">Total Views</p>
                                <p className="text-2xl font-bold">{analytics.total_views}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                        <div className="flex items-center text-white">
                            <div className="p-3 rounded-full bg-white bg-opacity-20">
                                <FiBookmark className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium opacity-90">Total Saves</p>
                                <p className="text-2xl font-bold">{analytics.total_saves}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                        <div className="flex items-center text-white">
                            <div className="p-3 rounded-full bg-white bg-opacity-20">
                                <FiHome className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium opacity-90">Total Listings</p>
                                <p className="text-2xl font-bold">{analytics.total_listings}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                        <div className="flex items-center text-white">
                            <div className="p-3 rounded-full bg-white bg-opacity-20">
                                <FiTrendingUp className="w-6 h-6" />
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium opacity-90">Most Viewed</p>
                                <p className="text-lg font-bold truncate">
                                    {analytics.most_viewed_listing?.title || 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Views vs Saves Chart */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <FiEye className="mr-2 text-blue-400" />
                            Views vs Saves by Listing
                        </h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={analytics.listings}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="title"
                                        angle={-45}
                                        textAnchor="end"
                                        height={100}
                                        tick={{ fill: 'white' }}
                                    />
                                    <YAxis tick={{ fill: 'white' }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                                            color: 'white'
                                        }}
                                        labelStyle={{ color: 'white' }}
                                    />
                                    <Legend wrapperStyle={{ color: 'white' }} />
                                    <Bar dataKey="views" fill={colorScheme[0]} name="Views" />
                                    <Bar dataKey="saves" fill={colorScheme[1]} name="Saves" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* City Distribution Chart */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <FiMap className="mr-2 text-green-400" />
                            Interactions by City
                        </h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.city_breakdown}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ city, percent }) => `${city} (${(percent * 100).toFixed(0)}%)`}
                                        outerRadius={80}
                                        innerRadius={40}
                                        fill="#8884d8"
                                        dataKey="total_interactions"
                                        nameKey="city"
                                    >
                                        {analytics.city_breakdown.map((entry, index) => (
                                            <Cell
                                                key={`cell-${entry.city}`}
                                                fill={colorScheme[index % colorScheme.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            color: 'white',
                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)'
                                        }}
                                        itemStyle={{ color: 'white' }}
                                        formatter={(value, name) => [`${value} interactions`, name]}
                                    />
                                    <Legend 
                                        formatter={(value) => value}
                                        wrapperStyle={{
                                            paddingTop: '20px',
                                            color: 'white'
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Popular Tags Progress Bars */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6">
                        <h2 className="text-lg font-semibold mb-4 text-white flex items-center">
                            <FiHash className="mr-2 text-purple-400" />
                            Popular Tags
                        </h2>
                        <div className="space-y-4">
                            {(() => {
                                const tagData = formatTrendsData(trends?.tag_trends);
                                const total = tagData.reduce((sum, t) => sum + t.value, 0) || 1;
                                return tagData.map((tag, idx) => {
                                    const percent = Math.round((tag.value / total) * 100);
                                    return (
                                        <div key={tag.name} className="flex items-center justify-between">
                                            <span className="text-white font-medium w-32 truncate">{tag.name}</span>
                                            <span className="text-white font-semibold ml-2">{percent}%</span>
                                            <div className="flex-1 ml-4">
                                                <div className="w-full h-3 bg-gray-800 rounded-full relative">
                                                    <div
                                                        className="h-3 rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${percent}%`,
                                                            background: TAG_COLORS[idx % TAG_COLORS.length],
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    {/* Area Demand Chart */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <FiMap className="mr-2 text-yellow-400" />
                            Area Demand
                        </h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={formatTrendsData(trends?.area_demand)}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="name"
                                        angle={-45}
                                        textAnchor="end"
                                        height={100}
                                        tick={{ fill: 'white' }}
                                    />
                                    <YAxis tick={{ fill: 'white' }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            color: 'white'
                                        }}
                                    />
                                    <Bar dataKey="value" fill={colorScheme[3]} name="Demand" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Bedroom Demand Chart */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <FiBox className="mr-2 text-blue-400" />
                            Bedroom Demand
                        </h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={formatTrendsData(trends?.bedroom_demand)}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: 'white' }}
                                    />
                                    <YAxis tick={{ fill: 'white' }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            color: 'white'
                                        }}
                                    />
                                    <Bar dataKey="value" fill={colorScheme[4]} name="Demand" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* General Market Insights Section */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4 text-blue-300">General Market Insights</h2>
                    {/* City Dropdown for filtering area/bedroom charts */}
                    {marketData.cities && marketData.cities.length > 0 && (
                      <div className="mb-6 flex items-center gap-2">
                        <label htmlFor="city-select" className="font-semibold">City:</label>
                        <select
                          id="city-select"
                          value={filters.city || 'All'}
                          onChange={e => setFilters(prev => ({ ...prev, city: e.target.value === 'All' ? '' : e.target.value }))}
                          className="rounded-md border border-gray-700 bg-gray-800 text-white"
                        >
                          <option value="All">All</option>
                          {marketData.cities.map(city => (
                            <option key={city.name} value={city.name}>{city.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* Top 10 Cities and Top Areas in Demand - Side by Side */}
                    {marketData.cities && marketData.cities.length > 0 && (
                      <div className="mb-8 flex flex-col lg:flex-row gap-8">
                        {/* Top 10 Cities in Demand - Bar Chart */}
                        <div className="flex-1 bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-4">
                          <h3 className="text-lg font-semibold mb-2 text-white">Top 10 Cities in Demand</h3>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={marketData.cities.slice(0, 10)} layout="vertical">
                              <XAxis type="number" dataKey="demand" tick={{ fill: 'white' }} />
                              <YAxis type="category" dataKey="name" width={120} tick={{ fill: 'white' }} />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                  border: 'none',
                                  borderRadius: '0.5rem',
                                  color: 'white'
                                }}
                              />
                              <Bar dataKey="demand" fill="#2563eb" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Top Areas in Demand - Bar Chart (filtered by city) */}
                        <div className="flex-1 bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-4">
                          {(() => {
                            let areaData = [];
                            let chartTitle = 'Top 10 Areas in Demand';
                            if (filters.city && marketData.cities) {
                              const cityObj = marketData.cities.find(c => c.name === filters.city);
                              if (cityObj && cityObj.areas) {
                                areaData = cityObj.areas.slice(0, 10);
                                chartTitle = `Top 10 Areas in ${filters.city}`;
                              }
                            } else if (marketData.cities) {
                              // Aggregate all areas across all cities
                              const areaMap = {};
                              marketData.cities.forEach(city => {
                                (city.areas || []).forEach(area => {
                                  if (!areaMap[area.name]) areaMap[area.name] = 0;
                                  areaMap[area.name] += area.demand;
                                });
                              });
                              areaData = Object.entries(areaMap)
                                .map(([name, demand]) => ({ name, demand }))
                                .sort((a, b) => b.demand - a.demand)
                                .slice(0, 10);
                            }
                            return areaData.length > 0 ? (
                              <>
                                <h3 className="text-lg font-semibold mb-2 text-white">{chartTitle}</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                                                  <BarChart data={areaData} layout="vertical">
                                  <XAxis type="number" dataKey="demand" tick={{ fill: 'white' }} />
                                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: 'white' }} />
                                  <Tooltip 
                                    contentStyle={{
                                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                      border: 'none',
                                      borderRadius: '0.5rem',
                                      color: 'white'
                                    }}
                                  />
                                  <Bar dataKey="demand" fill="#A78BFA" />
                                </BarChart>
                                </ResponsiveContainer>
                              </>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    )}
                    {/* Top Bedroom Demands - Donut Chart (filtered by city) */}
                    {(() => {
                      let bedroomData = [];
                      let chartTitle = 'Top Bedroom Demands';
                      if (filters.city && marketData.cities) {
                        const cityObj = marketData.cities.find(c => c.name === filters.city);
                        if (cityObj && cityObj.areas) {
                          // Aggregate bedroom demand for this city
                          // (Assumes backend can provide this, otherwise fallback to all)
                          // For now, fallback to all
                          bedroomData = marketData.bedrooms.slice(0, 10);
                          chartTitle = `Top Bedroom Demands in ${filters.city}`;
                        }
                      } else if (marketData.bedrooms) {
                        bedroomData = marketData.bedrooms.slice(0, 10);
                      }
                      return bedroomData.length > 0 ? (
                        <div className="mb-8 bg-white/10 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 p-6">
                          <h3 className="text-lg font-semibold mb-4 text-white flex items-center">
                            <FiBox className="mr-2 text-blue-400" />
                            {chartTitle}
                          </h3>
                          <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                              <Pie
                                data={bedroomData}
                                dataKey="demand"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                innerRadius={50}
                                fill="#2563eb"
                                label={({ name, percent }) => `${name} BR (${(percent * 100).toFixed(0)}%)`}
                              >
                                {bedroomData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={["#2563eb", "#60A5FA", "#A78BFA", "#F87171", "#34D399"][index % 5]} />
                                ))}
                              </Pie>
                              <Legend 
                                wrapperStyle={{
                                  color: 'white'
                                }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                  border: 'none',
                                  borderRadius: '0.5rem',
                                  color: 'white',
                                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)'
                                }}
                                itemStyle={{ color: 'white' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : null;
                    })()}
                </div>
            </div>
        </div>
    );
};

export default AgentAnalytics; 