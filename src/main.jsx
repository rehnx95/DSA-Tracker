import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { supabase } from './lib/supabase';
import App from './App';

// Initialize Supabase client globally for auth checks
window.supabase = supabase;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
