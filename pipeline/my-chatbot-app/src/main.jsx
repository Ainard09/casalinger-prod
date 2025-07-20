import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import App from './App.jsx';
import 'swiper/css';
import 'swiper/css/autoplay';
import 'swiper/css/pagination';

console.log('🚀 main.jsx is loading...');
console.log('🔍 Root element:', document.getElementById('root'));

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  );
  console.log('✅ React app rendered successfully');
} catch (error) {
  console.error('❌ Error rendering React app:', error);
}
