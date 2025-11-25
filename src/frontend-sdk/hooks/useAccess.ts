/**
 * Access control hooks for @wasserstoff/wstf-kit
 *
 * React hooks for managing access permissions, gated content, and authentication.
 */

import { useState, useEffect } from 'react';
import { useWstfContext, useWallet } from '../providers/WstfProvider';
import type { AccessPermission, AccessGuardStatus } from '../types';

/**
 * Hook to check access permissions for gated content
 */
export function useAccessGuard(opts: AccessPermission): AccessGuardStatus {
  const { sdk } = useWstfContext();
  const { account } = useWallet();
  const [status, setStatus] = useState<AccessGuardStatus>({
    allowed: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      if (!account?.address) {
        setStatus({
          allowed: false,
          loading: false,
          address: undefined,
        });
        return;
      }

      if (!sdk) {
        setStatus({
          allowed: null,
          loading: true,
          address: account.address,
        });
        return;
      }

      try {
        setStatus(prev => ({ ...prev, loading: true }));

        // Try to call a dedicated access-check RPC endpoint
        const response = await fetch(`${sdk.networkProfile.rpcUrls.core}/auth/access-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: account.address,
            orgId: opts.orgId,
            permission: opts.permission,
            varKey: opts.varKey,
          }),
        });

        if (!cancelled) {
          if (response.ok) {
            const data = await response.json();
            setStatus({
              allowed: data.allowed || false,
              loading: false,
              address: account.address,
            });
          } else {
            // If access-check endpoint doesn't exist, try alternative methods
            // For now, return a default false for unknown permissions
            setStatus({
              allowed: false,
              loading: false,
              address: account.address,
              error: 'Access check endpoint unavailable',
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            allowed: false,
            loading: false,
            address: account.address,
            error: String(error),
          });
        }
      }
    };

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [sdk, account?.address, opts.orgId, opts.permission, opts.varKey]);

  return status;
}

/**
 * Hook to get organization membership and roles
 */
export function useOrgMembership(orgId?: string) {
  const { sdk } = useWstfContext();
  const { account } = useWallet();
  const [membership, setMembership] = useState<{
    isMember: boolean;
    roles: string[];
    permissions: string[];
    loading: boolean;
    error?: string;
  }>({
    isMember: false,
    roles: [],
    permissions: [],
    loading: true,
  });

  useEffect(() => {
    if (!sdk || !account?.address || !orgId) {
      setMembership({
        isMember: false,
        roles: [],
        permissions: [],
        loading: false,
      });
      return;
    }

    const fetchMembership = async () => {
      try {
        setMembership(prev => ({ ...prev, loading: true }));

        // Call organization membership endpoint
        const response = await fetch(
          `${sdk.networkProfile.rpcUrls.core}/orgs/${orgId}/members/${account.address}`
        );

        if (response.ok) {
          const data = await response.json();
          setMembership({
            isMember: data.isMember || false,
            roles: data.roles || [],
            permissions: data.permissions || [],
            loading: false,
          });
        } else {
          setMembership({
            isMember: false,
            roles: [],
            permissions: [],
            loading: false,
            error: response.status === 404 ? 'Not a member' : 'Failed to check membership',
          });
        }
      } catch (error) {
        setMembership({
          isMember: false,
          roles: [],
          permissions: [],
          loading: false,
          error: String(error),
        });
      }
    };

    fetchMembership();
  }, [sdk, account?.address, orgId]);

  return membership;
}

/**
 * Hook to check specific permissions
 */
export function usePermissionCheck(permission: string, orgId?: string) {
  const { sdk } = useWstfContext();
  const { account } = useWallet();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdk || !account?.address || !permission) {
      setHasPermission(false);
      setLoading(false);
      return;
    }

    const checkPermission = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${sdk.networkProfile.rpcUrls.core}/auth/permissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: account.address,
            permission,
            orgId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setHasPermission(data.hasPermission || false);
        } else {
          setHasPermission(false);
          setError(`Permission check failed: ${response.status}`);
        }
      } catch (err) {
        setHasPermission(false);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [sdk, account?.address, permission, orgId]);

  return { hasPermission, loading, error };
}

/**
 * Hook to get user's accessible resources
 */
export function useAccessibleResources() {
  const { sdk } = useWstfContext();
  const { account } = useWallet();
  const [resources, setResources] = useState<Array<{
    resourceId: string;
    name: string;
    description?: string;
    accessLevel: 'read' | 'write' | 'admin';
    scopes: string[];
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdk || !account?.address) {
      setResources([]);
      setLoading(false);
      return;
    }

    const fetchAccessibleResources = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${sdk.networkProfile.rpcUrls.core}/auth/resources/accessible?address=${account.address}`
        );

        if (response.ok) {
          const data = await response.json();
          setResources(data.resources || []);
        } else {
          setResources([]);
          setError(`Failed to fetch resources: ${response.status}`);
        }
      } catch (err) {
        setResources([]);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchAccessibleResources();
  }, [sdk, account?.address]);

  return { resources, loading, error };
}

/**
 * Hook to create WSTFAuth tokens
 */
export function useAuthToken() {
  const { sdk } = useWstfContext();
  const { account } = useWallet();

  const createToken = (programId: string, ttlSeconds?: number): string | null => {
    if (!sdk?.signer || !account?.address) {
      return null;
    }

    try {
      return sdk.createAuthToken(programId, ttlSeconds);
    } catch (error) {
      console.error('Failed to create auth token:', error);
      return null;
    }
  };

  const createScopedToken = (
    programId: string,
    scopes: string[],
    ttlSeconds?: number
  ): string | null => {
    if (!sdk?.signer || !account?.address) {
      return null;
    }

    try {
      return sdk.createScopedToken(programId, scopes, ttlSeconds);
    } catch (error) {
      console.error('Failed to create scoped token:', error);
      return null;
    }
  };

  return {
    createToken,
    createScopedToken,
    canCreateTokens: !!(sdk?.signer && account?.address),
  };
}