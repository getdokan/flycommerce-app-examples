import { StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { appIdFromPage } from '@flycommerce/app-bridge';
import { AppBridgeProvider } from '@flycommerce/app-bridge/react';
import { ExportOrders } from './ExportOrders';
import { Settings } from './Settings';
import './styles.css';

// One component per page in app-config.json; the server sends this same bundle for each page's path.
const pages: Record<string, ComponentType> = { '/export': ExportOrders, '/settings': Settings };
const Page = pages[window.location.pathname] ?? ExportOrders;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBridgeProvider appId={appIdFromPage()}>
      <Page />
    </AppBridgeProvider>
  </StrictMode>
);
