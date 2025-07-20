import React, { useEffect, useState } from 'react';
import AgentCard from '../components/AgentCard';
import AgentFilters from '../components/AgentFilters';
import { API_BASE_URL } from '../utils/config';

const FindAgentPage = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Controlled input state (used for filtering)
  const [locationInput, setLocationInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [agentTypeInput, setAgentTypeInput] = useState('');

  useEffect(() => {
    fetch(API_BASE_URL + '/api/agents')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAgents(data);
        } else if (Array.isArray(data.agents)) {
          setAgents(data.agents);
        } else {
          setAgents([]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filtering logic (uses input state directly)
  const filteredAgents = Array.isArray(agents) ? agents.filter(agent => {
    const matchesLocation = locationInput === '' || (
      (agent.address && agent.address.toLowerCase().includes(locationInput.toLowerCase())) ||
      (agent.state && agent.state.toLowerCase().includes(locationInput.toLowerCase())) ||
      (agent.city && agent.city.toLowerCase().includes(locationInput.toLowerCase())) ||
      (agent.area && agent.area.toLowerCase().includes(locationInput.toLowerCase()))
    );
    const matchesName = nameInput === '' || (agent.name && agent.name.toLowerCase().includes(nameInput.toLowerCase()));
    const matchesType = agentTypeInput === '' || (agent.agent_type && agent.agent_type.toLowerCase() === agentTypeInput.toLowerCase());
    return matchesLocation && matchesName && matchesType;
  }) : [];

  // Handler for Reset button
  const handleReset = () => {
    setLocationInput('');
    setNameInput('');
    setAgentTypeInput('');
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      <div className="max-w-6xl mx-auto px-4 pt-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Find an Agent</h1>
        <AgentFilters
          location={locationInput}
          setLocation={setLocationInput}
          name={nameInput}
          setName={setNameInput}
          agentType={agentTypeInput}
          setAgentType={setAgentTypeInput}
          onReset={handleReset}
        />
        {loading ? (
          <div className="text-center py-10 text-gray-500">Loading agents...</div>
        ) : (
          <div className="flex flex-col gap-6 mt-8">
            {filteredAgents.length === 0 ? (
              <div className="text-center text-gray-500">No agents found.</div>
            ) : (
              filteredAgents.map((agent) => {
                // Parse languages and specialty for AgentCard
                let languages = [];
                if (typeof agent.languages === 'string') {
                  languages = agent.languages.split(',').map(l => l.trim()).filter(Boolean);
                } else if (Array.isArray(agent.languages)) {
                  languages = agent.languages;
                }
                let specialties = [];
                if (agent.specialty) {
                  specialties = [agent.specialty.replace('_', ' & ')];
                } else if (Array.isArray(agent.specialties)) {
                  specialties = agent.specialties;
                }
                return (
                  <AgentCard key={agent.id} agent={{ ...agent, languages, specialties }} />
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FindAgentPage; 