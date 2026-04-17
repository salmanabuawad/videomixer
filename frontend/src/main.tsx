import React from 'react';
import ReactDOM from 'react-dom/client';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import App from './App';
import { AppProvider } from './contexts/AppContext';
import './index.css';

// Register AG Grid community modules once (v34+ requires this)
ModuleRegistry.registerModules([AllCommunityModule]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
