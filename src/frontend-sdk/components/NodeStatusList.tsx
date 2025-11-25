/**
 * NodeStatusList - Component for displaying node health and status
 */

import React from 'react';
import { useNodes } from '../hooks/useNetwork';
import type { NodeRole, ComponentStyleProps } from '../types';

export interface NodeStatusListProps extends ComponentStyleProps {
  role?: NodeRole;
  showLatency?: boolean;
  showTrustScore?: boolean;
}

export function NodeStatusList({
  role,
  showLatency = true,
  showTrustScore = true,
  className = '',
  style,
}: NodeStatusListProps) {
  const { data: nodes, loading, error } = useNodes(role);

  if (loading) return <div>Loading nodes...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!nodes || nodes.length === 0) return <div>No nodes found</div>;

  return (
    <div className={`space-y-2 ${className}`} style={style}>
      {nodes.map((node) => (
        <div key={node.nodeId} className="p-3 border rounded">
          <div className="font-medium">{node.alias || node.nodeId}</div>
          <div className="text-sm text-gray-600">
            Roles: {node.roles.join(', ')}
            {showLatency && node.metrics && (
              <span> | Latency: {node.metrics.latencyMs}ms</span>
            )}
            {showTrustScore && node.trustScore && (
              <span> | Trust: {node.trustScore}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export const NodeStatusListSource = `
import { NodeStatusList } from '@wasserstoff/wstf-kit';

<NodeStatusList role="bridge" showLatency={true} showTrustScore={true} />
`;