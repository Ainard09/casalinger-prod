import { useState, useEffect, useRef, useContext } from 'react';
import { MessageCircle, X, Trash2, Send, Bot, User } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { API_ENDPOINTS } from '../utils/config';

const Chatbox = () => {
    const { currentUser } = useContext(AuthContext);
    if (!currentUser) return null;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState([]);
    const [showTeaser, setShowTeaser] = useState(true);
    const [isThinking, setIsThinking] = useState(false);
    const chatEndRef = useRef(null);

    const storageKey = `aiChatHistory_${currentUser?.id || 'guest'}`;

    useEffect(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored) setMessages(JSON.parse(stored));
    }, [storageKey]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const timer = setTimeout(() => setShowTeaser(false), 15000);
        return () => clearTimeout(timer);
    }, []);

    const addMessage = (text, sender) => {
        const newMsg = { text, sender, timestamp: new Date().toISOString() };
        setMessages(prev => {
            const updated = [...prev, newMsg];
            localStorage.setItem(storageKey, JSON.stringify(updated));
            return updated;
        });
    };

    const updateLastAiMessage = (newText) => {
        setMessages(prev => {
            const updated = [...prev];
            const aiIndex = [...updated].reverse().findIndex(m => m.sender === 'ai');
            const index = aiIndex >= 0 ? updated.length - 1 - aiIndex : -1;
            if (index !== -1) updated[index].text = newText;
            localStorage.setItem(storageKey, JSON.stringify(updated));
            return updated;
        });
    };

    const handleAskAI = async () => {
        if (!query.trim() || isThinking) return;

        const userMessage = query.trim();
        setQuery('');
        addMessage(userMessage, 'user');
        setIsThinking(true);

        const history = [...messages, { text: userMessage, sender: 'user' }]
            .map(m => ({ role: m.sender, content: m.text }));

        try {
            const res = await fetch(API_ENDPOINTS.ASK_AI, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ query: userMessage, history, user_id: currentUser?.id })
            });

            const data = await res.json();
            const aiMsg = data.response || data.error || '❌ Sorry, something went wrong.';
            addMessage(aiMsg, 'ai');
        } catch (err) {
            addMessage('❌ Could not reach AI Assistant.', 'ai');
        } finally {
            setIsThinking(false);
        }
    };

    const handleReset = () => {
        localStorage.removeItem(storageKey);
        setMessages([]);
    };

    const formatText = (text) => {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // bold
            .replace(/\n/g, '<br>');                           // new lines
    };

    const ThinkingIndicator = () => (
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-4 py-3 max-w-[80%] mr-auto">
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-blue-700 font-medium">CasaLinger</span>
            </div>
        </div>
    );

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {!open ? (
                <div className="flex flex-col items-end gap-3">
                    {showTeaser && (
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-bounce">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">Chat with CasaLinger AI</span>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setOpen(true)}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110"
                        title="Chat with AI Assistant"
                    >
                        <MessageCircle className="w-6 h-6" />
                    </button>
                </div>
            ) : (
                <div className="w-96 h-[600px] bg-white shadow-2xl rounded-2xl flex flex-col overflow-hidden border border-gray-200">
                    {/* Enhanced Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="font-semibold">CasaLinger Assistant</h2>
                                <p className="text-xs text-blue-100">AI-powered real estate help</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleReset}
                                    title="Clear Chat"
                                    className="hover:bg-white/20 p-2 rounded-full transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setOpen(false)}
                                    title="Close Chat"
                                    className="hover:bg-white/20 p-2 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Chat Body */}
                    <div className="flex-1 p-4 overflow-y-auto text-sm space-y-4 bg-gray-50">
                        {messages.length === 0 && (
                            <div className="text-center py-8">
                                <h3 className="font-semibold text-gray-700 mb-2">Welcome to CasaLinger AI!</h3>
                                <p className="text-gray-500 text-sm">Ask me anything about real estate in Nigeria</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`rounded-2xl px-4 py-3 max-w-[75%] ${msg.sender === 'user'
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                                            : 'bg-white border border-gray-200 shadow-sm'
                                        }`}
                                >
                                    <p
                                        className={`whitespace-pre-wrap ${msg.sender === 'user' ? 'text-white' : 'text-gray-800'}`}
                                        dangerouslySetInnerHTML={{ __html: formatText(msg.text) }}
                                    ></p>
                                </div>
                            </div>
                        ))}

                        {isThinking && <ThinkingIndicator />}

                        <div ref={chatEndRef} />
                    </div>

                    {/* Enhanced Chat Input */}
                    <div className="border-t border-gray-200 p-4 bg-white">
                        <div className="flex gap-3">
                            <textarea
                                placeholder="Ask about properties, prices, locations..."
                                className="flex-1 text-sm p-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors resize-none min-h-[44px] max-h-40"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAskAI();
                                    }
                                    // Shift+Enter will insert a new line by default in textarea
                                }}
                                disabled={isThinking}
                            />
                            <button
                                onClick={handleAskAI}
                                disabled={!query.trim() || isThinking}
                                className={`p-3 rounded-xl transition-all duration-200 flex items-center justify-center ${query.trim() && !isThinking
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg transform hover:scale-105'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chatbox;







