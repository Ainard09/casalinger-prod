import React from 'react';

const AgentFilters = ({ location, setLocation, name, setName, agentType, setAgentType }) => {
  return (
    <form
      className="bg-white rounded-lg shadow p-4 flex flex-col gap-4 md:grid md:grid-cols-6 md:items-end border border-gray-100"
      onSubmit={e => e.preventDefault()}
    >
      <div className="flex flex-col gap-2 md:col-span-1">
        <label className="text-xs font-semibold text-gray-600">Location</label>
        <input
          type="text"
          placeholder="State, City or Area"
          className="px-3 py-2 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-700"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-1">
        <label className="text-xs font-semibold text-gray-600">Agent Name</label>
        <input
          type="text"
          placeholder="Search by agent name"
          className="px-3 py-2 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-700"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-1">
        <label className="text-xs font-semibold text-gray-600">Agent Type</label>
        <select
          className="px-3 py-2 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50 text-gray-700"
          value={agentType}
          onChange={e => setAgentType(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="freelance">Freelance</option>
          <option value="management_company">Management Company</option>
          <option value="property_owner">Property Owner</option>
        </select>
      </div>
      <div className="flex flex-col gap-2 md:col-span-1">
        <label className="text-xs font-semibold text-gray-600 opacity-0">Search</label>
        <button
          className="px-6 py-2 rounded bg-blue-600 text-white font-bold shadow hover:bg-blue-700 transition w-full"
          type="button"
          tabIndex={-1}
        >
          Search
        </button>
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
        <button type="button" className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">Buying</button>
        <button type="button" className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">Selling</button>
        <button type="button" className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">Top Agent</button>
        <button type="button" className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">Price Range</button>
        <button type="button" className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">Specialty</button>
        <button type="button" className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200 hover:bg-blue-100 transition">Language</button>
      </div>
    </form>
  );
};

export default AgentFilters; 