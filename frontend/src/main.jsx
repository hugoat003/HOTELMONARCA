import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { blockAccidentalZoom } from './lib/noZoom.js';
import './styles/index.css';

blockAccidentalZoom();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
