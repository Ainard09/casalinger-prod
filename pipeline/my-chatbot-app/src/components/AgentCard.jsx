import React from 'react';

const getAgentPhotoUrl = (photo_url, name) => {
  if (!photo_url) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
  }
  if (photo_url.startsWith('http')) {
    return photo_url;
  }
  // Fallback to avatar generator if not a valid URL
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
};

const formatAgentType = (type) => {
  if (!type) return '';
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const AgentCard = ({ agent }) => {
  return (
    <div className="flex flex-col sm:flex-row items-center bg-white rounded-xl shadow-md p-6 gap-6 hover:shadow-lg transition border border-gray-100">
      <img
        src={getAgentPhotoUrl(agent.photo_url, agent.name)}
        alt={agent.name}
        className="w-24 h-24 rounded-full object-cover border-2 border-blue-200 shadow-sm bg-gray-100"
      />
      <div className="flex-1 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full">
          <div>
            <div className="font-bold text-lg text-gray-800 flex items-center gap-2">
              {agent.name}
              {agent.badges && agent.badges.map((badge, i) => (
                <span key={i} className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-semibold uppercase">{badge}</span>
              ))}
            </div>
            <div className="text-gray-500 text-sm mt-1">
              {agent.agent_type === 'company'
                ? 'Management Company'
                : agent.company || formatAgentType(agent.agent_type)}
            </div>
            <div className="text-gray-500 text-xs mt-1">{agent.address}</div>
          </div>
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            {agent.rating && (
              <span className="text-blue-600 font-semibold text-base flex items-center">
                {agent.rating} <span className="ml-1 text-yellow-400">★</span>
              </span>
            )}
            {agent.reviews && (
              <span className="text-gray-500 text-xs">({agent.reviews} reviews)</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1">
            <span className="font-medium text-gray-700">Email:</span>
            <a href={`mailto:${agent.email}`} className="text-blue-600 hover:underline">{agent.email}</a>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-medium text-gray-700">Phone:</span>
            <a href={`tel:${agent.phone}`} className="text-blue-600 hover:underline">{agent.phone}</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {agent.specialty && (
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">Specialty: {agent.specialty.replace('_', ' & ')}</span>
          )}
          {agent.languages && agent.languages.length > 0 && (
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">Languages: {Array.isArray(agent.languages) ? agent.languages.join(', ') : agent.languages}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentCard; 