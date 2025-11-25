/**
 * BridgeOrderStatus - Component for displaying bridge order status
 */

import React from 'react';
import type { BridgeOrderStatus as Status, ComponentStyleProps } from '../types';

export interface BridgeOrderStatusProps extends ComponentStyleProps {
  status: Status;
  showProgressBar?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function BridgeOrderStatus({
  status,
  showProgressBar = true,
  size = 'md',
  className = '',
  style,
}: BridgeOrderStatusProps) {
  const getStatusColor = (status: Status) => {
    switch (status) {
      case 'CONFIRMED': return 'text-green-600';
      case 'FAILED': return 'text-red-600';
      case 'EXPIRED': return 'text-gray-500';
      case 'CANCELLED': return 'text-gray-500';
      default: return 'text-blue-600';
    }
  };

  const getProgressPercent = (status: Status) => {
    switch (status) {
      case 'PENDING': return 10;
      case 'LOCKED_SRC': return 25;
      case 'CONFIRMED_SRC': return 50;
      case 'SENT_DST': return 75;
      case 'CONFIRMED': return 100;
      case 'FAILED': return 0;
      case 'EXPIRED': return 0;
      case 'CANCELLED': return 0;
      default: return 0;
    }
  };

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={`${className} ${sizeClasses[size]}`} style={style}>
      <div className={`font-medium ${getStatusColor(status)}`}>
        {status.replace('_', ' ')}
      </div>

      {showProgressBar && (
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED'
                ? 'bg-red-500'
                : status === 'CONFIRMED'
                ? 'bg-green-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${getProgressPercent(status)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export const BridgeOrderStatusSource = `
import { BridgeOrderStatus } from '@wasserstoff/wstf-kit';

<BridgeOrderStatus
  status="CONFIRMED_SRC"
  showProgressBar={true}
  size="md"
/>
`;