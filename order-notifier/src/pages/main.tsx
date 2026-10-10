import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { appIdFromPage } from '@flycommerce/app-bridge';
import { AppBridgeProvider } from '@flycommerce/app-bridge/react';
import { Settings } from './Settings';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBridgeProvider appId={appIdFromPage()}>
      <Settings />
    </AppBridgeProvider>
  </StrictMode>
);
