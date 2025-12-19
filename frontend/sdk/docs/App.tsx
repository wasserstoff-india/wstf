/**
 * WSTF Kit Playground App
 *
 * Documentation and live demo application for @wasserstoff/wstf-kit.
 */

import React, { useState } from 'react';
import { WstfProvider } from '../react/WstfProvider';
import { PageLayout } from './components/PageLayout';
import {
  GettingStarted,
  WalletsPage,
  ExplorerPage,
  MarketsPage,
  SwapDemoPage,
  LPAndTradingPage,
  TokensDemoPage,
  VarsDemoPage,
  DevnetExplorerPage,
} from './routes';

// ============================================================
// Route Configuration
// ============================================================

type RouteId =
  | 'getting-started'
  | 'wallets'
  | 'explorer'
  | 'markets'
  | 'swap'
  | 'lp-trading'
  | 'tokens'
  | 'vars'
  | 'devnet-explorer';

const routes: Record<RouteId, React.FC> = {
  'getting-started': GettingStarted,
  'wallets': WalletsPage,
  'explorer': ExplorerPage,
  'markets': MarketsPage,
  'swap': SwapDemoPage,
  'lp-trading': LPAndTradingPage,
  'tokens': TokensDemoPage,
  'vars': VarsDemoPage,
  'devnet-explorer': DevnetExplorerPage,
};

// ============================================================
// App Component
// ============================================================

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<RouteId>('getting-started');
  const isProduction = process.env.NODE_ENV === 'production';

  const CurrentPage = routes[currentRoute];

  return (
    <WstfProvider config={isProduction ? 'testnet' : 'devnet'} autoConnect={true}>
      <PageLayout currentRoute={currentRoute} onNavigate={(route) => setCurrentRoute(route as RouteId)}>
        <CurrentPage />
      </PageLayout>
    </WstfProvider>
  );
};

// ============================================================
// Source Code Export
// ============================================================

export const AppSource = `
import React, { useState } from 'react';
import { WstfProvider } from '@wasserstoff/wstf-kit/react';

// Import your pages
import { GettingStarted } from './routes/GettingStarted';
import { WalletsPage } from './routes/Wallets';
// ... more routes

export function App() {
  const [route, setRoute] = useState('getting-started');

  return (
    <WstfProvider config={{ network: 'devnet' }}>
      <Navigation currentRoute={route} onNavigate={setRoute} />
      <main>
        {route === 'getting-started' && <GettingStarted />}
        {route === 'wallets' && <WalletsPage />}
        {/* ... more routes */}
      </main>
    </WstfProvider>
  );
}
`.trim();
