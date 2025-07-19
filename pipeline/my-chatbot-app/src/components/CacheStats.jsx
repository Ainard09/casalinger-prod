import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Database, Clock, TrendingUp, TrendingDown } from 'lucide-react';

const CacheStats = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const response = await axios.get('http://127.0.0.1:5000/api/cache/stats');
            setStats(response.data);
            setError(null);
        } catch (err) {
            setError('Failed to fetch cache statistics');
            console.error('Cache stats error:', err);
        } finally {
            setLoading(false);
        }
    };

    const clearCache = async () => {
        try {
            await axios.post('http://127.0.0.1:5000/api/cache/clear');
            fetchStats(); // Refresh stats after clearing
        } catch (err) {
            setError('Failed to clear cache');
            console.error('Clear cache error:', err);
        }
    };

    useEffect(() => {
        fetchStats();
        // Refresh stats every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-md p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                    <div className="space-y-3">
                        <div className="h-3 bg-gray-200 rounded"></div>
                        <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                        <div className="h-3 bg-gray-200 rounded w-4/6"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                    <Database className="w-5 h-5 text-red-500 mr-2" />
                    <span className="text-red-700">{error}</span>
                </div>
            </div>
        );
    }

    if (!stats || stats.error) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                    <Database className="w-5 h-5 text-yellow-500 mr-2" />
                    <span className="text-yellow-700">
                        {stats?.error || 'Redis not available'}
                    </span>
                </div>
            </div>
        );
    }

    const hitRate = stats.keyspace_hits + stats.keyspace_misses > 0 
        ? ((stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses)) * 100).toFixed(1)
        : 0;

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Database className="w-5 h-5 mr-2 text-blue-600" />
                    Redis Cache Statistics
                </h3>
                <button
                    onClick={clearCache}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                    Clear Cache
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Connected Clients */}
                <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center">
                        <Activity className="w-5 h-5 text-blue-600 mr-2" />
                        <div>
                            <p className="text-sm text-blue-600 font-medium">Connected Clients</p>
                            <p className="text-2xl font-bold text-blue-900">{stats.connected_clients}</p>
                        </div>
                    </div>
                </div>

                {/* Memory Usage */}
                <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center">
                        <Database className="w-5 h-5 text-green-600 mr-2" />
                        <div>
                            <p className="text-sm text-green-600 font-medium">Memory Usage</p>
                            <p className="text-2xl font-bold text-green-900">{stats.used_memory_human}</p>
                        </div>
                    </div>
                </div>

                {/* Hit Rate */}
                <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center">
                        <TrendingUp className="w-5 h-5 text-purple-600 mr-2" />
                        <div>
                            <p className="text-sm text-purple-600 font-medium">Cache Hit Rate</p>
                            <p className="text-2xl font-bold text-purple-900">{hitRate}%</p>
                        </div>
                    </div>
                </div>

                {/* Uptime */}
                <div className="bg-orange-50 rounded-lg p-4">
                    <div className="flex items-center">
                        <Clock className="w-5 h-5 text-orange-600 mr-2" />
                        <div>
                            <p className="text-sm text-orange-600 font-medium">Uptime</p>
                            <p className="text-2xl font-bold text-orange-900">
                                {Math.floor(stats.uptime_in_seconds / 3600)}h
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Stats */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Cache Hits</h4>
                    <p className="text-3xl font-bold text-green-600">{stats.keyspace_hits.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Cache Misses</h4>
                    <p className="text-3xl font-bold text-red-600">{stats.keyspace_misses.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">Total Commands</h4>
                    <p className="text-3xl font-bold text-blue-600">{stats.total_commands_processed.toLocaleString()}</p>
                </div>
            </div>

            {/* Performance Indicator */}
            <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Cache Performance</span>
                    <span className="text-sm text-gray-500">{hitRate}% hit rate</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                        className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${hitRate}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Poor</span>
                    <span>Good</span>
                    <span>Excellent</span>
                </div>
            </div>
        </div>
    );
};

export default CacheStats; 