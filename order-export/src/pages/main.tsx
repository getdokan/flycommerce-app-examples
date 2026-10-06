import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { appIdFromPage } from '@flycommerce/app-bridge';
import { AppBridgeProvider } from '@flycommerce/app-bridge/react';
import { ExportOrders } from './ExportOrders';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBridgeProvider appId={appIdFromPage()}>
      <ExportOrders />
    </AppBridgeProvider>
  </StrictMode>
);
