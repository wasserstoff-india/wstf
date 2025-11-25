/**
 * BridgeRouteTable - Component for displaying bridge routes
 */

import React from 'react';
import type { BridgeRoute, ComponentStyleProps } from '../types';

export interface BridgeRouteTableProps extends ComponentStyleProps {
  routes: BridgeRoute[];
  onSelectRoute?: (route: BridgeRoute) => void;
  selectedRouteId?: string;
}

export function BridgeRouteTable({
  routes,
  onSelectRoute,
  selectedRouteId,
  className = '',
  style,
}: BridgeRouteTableProps) {
  if (routes.length === 0) {
    return <div>No routes available</div>;
  }

  return (
    <div className={`overflow-x-auto ${className}`} style={style}>
      <table className="min-w-full border-collapse border border-gray-200">
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-gray-200 px-4 py-2">Provider</th>
            <th className="border border-gray-200 px-4 py-2">Fee</th>
            <th className="border border-gray-200 px-4 py-2">Time</th>
            <th className="border border-gray-200 px-4 py-2">Trust</th>
            <th className="border border-gray-200 px-4 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr
              key={route.routeId}
              className={selectedRouteId === route.routeId ? 'bg-blue-50' : ''}
            >
              <td className="border border-gray-200 px-4 py-2">{route.providerName}</td>
              <td className="border border-gray-200 px-4 py-2">{(route.feeBps / 100).toFixed(2)}%</td>
              <td className="border border-gray-200 px-4 py-2">{Math.ceil(route.estimatedTimeSec / 60)}min</td>
              <td className="border border-gray-200 px-4 py-2">{route.trustScore}/1000</td>
              <td className="border border-gray-200 px-4 py-2">
                <button
                  onClick={() => onSelectRoute?.(route)}
                  className="px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Select
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const BridgeRouteTableSource = `
import { BridgeRouteTable } from '@wasserstoff/wstf-kit';

<BridgeRouteTable
  routes={routes}
  onSelectRoute={(route) => console.log('Selected:', route)}
  selectedRouteId={selectedRouteId}
/>
`;