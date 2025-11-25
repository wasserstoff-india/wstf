/**
 * ProtectedPage - Access control component for gated content
 *
 * Protects content based on WSTFChain permissions, organization membership,
 * or custom access rules.
 */

import React, { ReactNode } from 'react';
import { useAccessGuard } from '../hooks/useAccess';
import type { AccessPermission, ComponentStyleProps } from '../types';

export interface ProtectedPageProps extends ComponentStyleProps {
  /** Access permissions required to view content */
  orgId?: string;
  permission?: string;
  varKey?: string;

  /** Content to show when access is granted */
  children: ReactNode;

  /** Content to show when access is denied */
  fallback?: ReactNode;

  /** Content to show while checking access */
  loadingFallback?: ReactNode;

  /** Callback when access status changes */
  onAccessChange?: (allowed: boolean, address?: string) => void;
}

/**
 * Protected page component with access control
 */
export function ProtectedPage({
  orgId,
  permission,
  varKey,
  children,
  fallback,
  loadingFallback,
  onAccessChange,
  className,
  style,
}: ProtectedPageProps) {
  const accessPermission: AccessPermission = { orgId, permission, varKey };
  const { allowed, loading, error, address } = useAccessGuard(accessPermission);

  // Notify parent of access changes
  React.useEffect(() => {
    if (allowed !== null) {
      onAccessChange?.(allowed, address);
    }
  }, [allowed, address, onAccessChange]);

  // Loading state
  if (loading) {
    return (
      <div className={className} style={style}>
        {loadingFallback || (
          <div className="flex items-center justify-center p-8">
            <div className="text-gray-600">Checking access permissions...</div>
          </div>
        )}
      </div>
    );
  }

  // Access denied
  if (!allowed) {
    return (
      <div className={className} style={style}>
        {fallback || (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="text-red-600 text-lg font-semibold mb-2">
                Access Denied
              </div>
              <div className="text-gray-600">
                {error || 'You do not have permission to view this content.'}
              </div>
              {!address && (
                <div className="mt-4 text-sm text-gray-500">
                  Please connect your wallet to check access permissions.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Access granted
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * Component source code for copy-paste usage
 */
export const ProtectedPageSource = `
import React from 'react';
import { ProtectedPage } from '@wasserstoff/wstf-kit';

function MyProtectedDashboard() {
  return (
    <ProtectedPage
      orgId="my.app.org"
      permission="app.dashboard.view"
      fallback={
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
          <p>You need dashboard permissions to view this content.</p>
        </div>
      }
    >
      <div>
        <h1>Protected Dashboard Content</h1>
        <p>This content is only visible to authorized users.</p>
      </div>
    </ProtectedPage>
  );
}
`;

/**
 * Higher-order component for protecting entire routes
 */
export function withProtection<P extends object>(
  Component: React.ComponentType<P>,
  accessConfig: AccessPermission
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedPage {...accessConfig}>
        <Component {...props} />
      </ProtectedPage>
    );
  };
}