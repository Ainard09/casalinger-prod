import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AgentLogin from "./pages/AgentLogin";
import AgentRegister from "./pages/AgentRegister";
import UserOnboarding from "./pages/UserOnboarding";
import AgentOnboarding from "./pages/AgentOnboarding";
import AgentDashboard from "./pages/AgentDashboard";
import AgentAnalytics from "./pages/AgentAnalytics";
import AgentTrends from "./pages/AgentTrends";
import Community from "./pages/Community";
import Agents from "./pages/Agents";
import FeaturedProperties from "./pages/FeaturedProperties";
import ListingDetails from "./pages/ListingDetails";
import Chatbot from "./components/Chatbot";
import SessionTimeoutWarning from './components/SessionTimeoutWarning';
import AutoLogout from "./components/AutoLogout";
import PrivateRoute from "./components/PrivateRoute";
import Dashboard from "./pages/Dashboard";
import PostListing from "./pages/PostListing";
import EditAgentProfile from "./pages/EditAgentProfile";
import AgentProfile from "./pages/AgentProfile";
import EditListing from "./pages/EditListing";
import CacheStatsPage from "./pages/CacheStatsPage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminRegister from "./pages/AdminRegister";
import AdminOnboarding from './pages/AdminOnboarding';
import ResetPassword from './pages/ResetPassword';
import { useContext, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import useAutoDarkMode from './hooks/useAutoDarkMode';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">The app encountered an error and couldn't load properly.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Reload Page
            </button>
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-gray-500">Error Details</summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                {this.state.error?.toString()}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Updated Logout component for Supabase
const Logout = () => {
  const { setCurrentUser } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    // Clear all user data from localStorage and context
    localStorage.removeItem('adminData');
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    navigate('/login');
  }, [setCurrentUser, navigate]);

  return <div>Logging out...</div>;
};

function AppWithAuth() {
  const { currentUser } = useContext(AuthContext);
  const showChatbot = currentUser && !currentUser.is_agent;

  useAutoDarkMode();

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <AutoLogout />
      <Navbar />
      <div className="pt-20">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={
            <>
              <FeaturedProperties />
              {showChatbot && <Chatbot />}
            </>
          } />
          <Route path="/listing/:id" element={
            <>
              <ListingDetails />
              {showChatbot && <Chatbot />}
            </>
          } />
          <Route path="/login" element={<Login />} />
          <Route path="/register/*" element={<Register />} />
          <Route path="/agent/login" element={<AgentLogin />} />
          <Route path="/agent/register/*" element={<AgentRegister />} />
          <Route path="/cache/stats" element={<CacheStatsPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/register" element={<Navigate to="/sign-up" replace />} />
          <Route path="/sign-up/*" element={<AdminRegister />} />
          <Route path="/admin/onboarding" element={<AdminOnboarding />} />
          <Route path="/user/onboarding" element={<UserOnboarding />} />
          <Route path="/agent/onboarding" element={<AgentOnboarding />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Protected Routes */}
          <Route
            path="/agent/dashboard"
            element={
              <PrivateRoute>
                <>
                  <AgentDashboard />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/agent/analytics"
            element={
              <PrivateRoute>
                <>
                  <AgentAnalytics />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/agent/trends"
            element={
              <PrivateRoute>
                <>
                  <AgentTrends />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/community"
            element={
              <PrivateRoute>
                <>
                  <Community />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/agents"
            element={
              <PrivateRoute>
                <>
                  <Agents />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <>
                  <Dashboard />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/post-listing"
            element={
              <PrivateRoute>
                <>
                  <PostListing />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/listing/edit/:id"
            element={
              <PrivateRoute>
                <>
                  <EditListing />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/agent/edit-profile"
            element={
              <PrivateRoute>
                <>
                  <EditAgentProfile />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/agent/profile"
            element={
              <PrivateRoute>
                <>
                  <AgentProfile />
                  {showChatbot && <Chatbot />}
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <PrivateRoute>
                <>
                  <AdminDashboard />
                  <SessionTimeoutWarning />
                </>
              </PrivateRoute>
            }
          />
          <Route path="/logout" element={<Logout />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  console.log('🚀 App component is loading...');

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppWithAuth />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;




