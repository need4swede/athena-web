// Polyfill for URL.parse on older iOS Safari versions (16.x and below)
// Only add if URL.parse doesn't exist to avoid interfering with modern browsers
if (typeof URL !== 'undefined' && !URL.parse) {
  console.log('🔧 Adding URL.parse polyfill for older iOS Safari');
  URL.parse = function(url, base) {
    try {
      return new URL(url, base);
    } catch (e) {
      console.warn('URL.parse polyfill failed:', e);
      return null;
    }
  };
} else if (URL && URL.parse) {
  console.log('✅ Native URL.parse available');
}

import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);
