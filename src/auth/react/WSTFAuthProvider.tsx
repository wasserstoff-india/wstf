/**
 * WSTFAuth React Provider
 *
 * React components and hooks for client-side WSTFAuth integration.
 * Provides authentication state management and protected component rendering.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { WSTFAuthToken, AccessControlList } from '../wstf-auth';
import { KeypairSigner } from '../../sdk/core/signer';

/**
 * Authentication state
 */
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: WSTFAuthToken | null;
  user: {
    publicKey: string;
    label: string;
    level: 'read' | 'write' | 'admin';
    scopes: string[];
  } | null;
  resource: {
    id: string;
    name: string;
    owner: string;
  } | null;
  error: string | null;
}

/**
 * Authentication context
 */
interface AuthContextType extends AuthState {
  login: (signer: KeypairSigner, resourceId?: string) => Promise<void>;
  logout: () => Promise<void>;
  hasScope: (scope: string) => boolean;
  hasLevel: (level: 'read' | 'write' | 'admin') => boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * WSTFAuth Provider Component
 */
interface WSTFAuthProviderProps {
  children: ReactNode;
  resourceId: string;
  apiBaseUrl?: string;
  autoRefresh?: boolean;
  onAuthChange?: (state: AuthState) => void;
}

export function WSTFAuthProvider({
  children,
  resourceId,
  apiBaseUrl = '',
  autoRefresh = true,
  onAuthChange
}: WSTFAuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    token: null,
    user: null,
    resource: null,
    error: null
  });

  // Load existing authentication on mount
  useEffect(() => {
    loadExistingAuth();
  }, [resourceId]);

  // Auto-refresh token before expiration
  useEffect(() => {
    if (autoRefresh && state.token) {
      const timeUntilExpiry = state.token.exp - Date.now();
      const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 60 * 1000); // 5 minutes before expiry

      const timer = setTimeout(() => {
        refreshAuth();
      }, refreshTime);

      return () => clearTimeout(timer);
    }
  }, [state.token, autoRefresh]);

  // Notify of auth changes
  useEffect(() => {
    onAuthChange?.(state);
  }, [state, onAuthChange]);

  /**
   * Load existing authentication from storage/URL
   */
  async function loadExistingAuth(): Promise<void> {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      let token: WSTFAuthToken | null = null;

      // Try to get token from URL parameters first
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('wstf_token');
      if (tokenParam) {
        try {
          token = JSON.parse(atob(tokenParam));
          // Store in localStorage for future use
          localStorage.setItem('wstf_auth_token', JSON.stringify(token));
          // Clean up URL
          urlParams.delete('wstf_token');
          const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
          window.history.replaceState({}, '', newUrl);
        } catch (e) {
          console.warn('Invalid token in URL parameter');
        }
      }

      // Try localStorage if no URL token
      if (!token) {
        const storedToken = localStorage.getItem('wstf_auth_token');
        if (storedToken) {
          try {
            token = JSON.parse(storedToken);
          } catch (e) {
            localStorage.removeItem('wstf_auth_token');
          }
        }
      }

      // Try cookie as fallback
      if (!token) {
        const cookies = document.cookie.split(';');
        const authCookie = cookies.find(c => c.trim().startsWith('wstf_auth='));
        if (authCookie) {
          try {
            const cookieValue = authCookie.split('=')[1];
            token = JSON.parse(atob(cookieValue));
          } catch (e) {
            console.warn('Invalid auth cookie');
          }
        }
      }

      if (token) {
        await validateAndSetAuth(token);
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isAuthenticated: false
        }));
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
        isAuthenticated: false
      }));
    }
  }

  /**
   * Validate token with server and set auth state
   */
  async function validateAndSetAuth(token: WSTFAuthToken): Promise<void> {
    try {
      // Validate token format and expiry
      if (!token || token.exp < Date.now() || token.aud !== resourceId) {
        throw new Error('Invalid or expired token');
      }

      // Verify with server
      const response = await fetch(`${apiBaseUrl}/auth/user-info`, {
        headers: {
          'Authorization': `Bearer ${btoa(JSON.stringify(token))}`
        }
      });

      if (!response.ok) {
        throw new Error('Token validation failed');
      }

      const userInfo = await response.json();
      if (!userInfo.ok) {
        throw new Error(userInfo.error);
      }

      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        token,
        user: userInfo.user,
        resource: userInfo.user.resource,
        error: null
      }));

    } catch (error) {
      // Clear invalid token
      localStorage.removeItem('wstf_auth_token');
      document.cookie = 'wstf_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        isLoading: false,
        token: null,
        user: null,
        resource: null,
        error: error.message
      }));
    }
  }

  /**
   * Login with WSTF signer
   */
  async function login(signer: KeypairSigner, targetResourceId?: string): Promise<void> {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const resource = targetResourceId || resourceId;

      // Request challenge from server
      const challengeResponse = await fetch(`${apiBaseUrl}/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: resource,
          publicKey: signer.publicKeyBase64
        })
      });

      if (!challengeResponse.ok) {
        throw new Error('Failed to get authentication challenge');
      }

      const challengeData = await challengeResponse.json();
      if (!challengeData.ok) {
        throw new Error(challengeData.error);
      }

      const challenge = challengeData.challenge;

      // Sign the challenge
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signature = await signer.sign(messageBytes);

      // Verify challenge with server
      const verifyResponse = await fetch(`${apiBaseUrl}/auth/verify-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          publicKey: signer.publicKeyBase64,
          signature
        })
      });

      if (!verifyResponse.ok) {
        throw new Error('Authentication failed');
      }

      const verifyResult = await verifyResponse.json();
      if (!verifyResult.ok) {
        throw new Error(verifyResult.error);
      }

      const token = verifyResult.token;

      // Store token
      localStorage.setItem('wstf_auth_token', JSON.stringify(token));

      await validateAndSetAuth(token);

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
        isAuthenticated: false
      }));
      throw error;
    }
  }

  /**
   * Logout user
   */
  async function logout(): Promise<void> {
    try {
      // Notify server of logout
      if (state.token) {
        await fetch(`${apiBaseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${btoa(JSON.stringify(state.token))}`
          }
        });
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    }

    // Clear local storage
    localStorage.removeItem('wstf_auth_token');
    document.cookie = 'wstf_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    setState({
      isAuthenticated: false,
      isLoading: false,
      token: null,
      user: null,
      resource: null,
      error: null
    });
  }

  /**
   * Check if user has specific scope
   */
  function hasScope(scope: string): boolean {
    if (!state.user) return false;
    return state.user.scopes.includes('*') || state.user.scopes.includes(scope);
  }

  /**
   * Check if user has specific access level
   */
  function hasLevel(level: 'read' | 'write' | 'admin'): boolean {
    if (!state.user) return false;
    const levelHierarchy = { read: 0, write: 1, admin: 2 };
    return levelHierarchy[state.user.level] >= levelHierarchy[level];
  }

  /**
   * Refresh authentication
   */
  async function refreshAuth(): Promise<void> {
    if (state.token) {
      await validateAndSetAuth(state.token);
    } else {
      await loadExistingAuth();
    }
  }

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    hasScope,
    hasLevel,
    refreshAuth
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use WSTFAuth context
 */
export function useWSTFAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useWSTFAuth must be used within a WSTFAuthProvider');
  }
  return context;
}

/**
 * Component that renders children only if authenticated
 */
interface ProtectedProps {
  children: ReactNode;
  level?: 'read' | 'write' | 'admin';
  scope?: string;
  fallback?: ReactNode;
  loginPrompt?: boolean;
}

export function Protected({
  children,
  level = 'read',
  scope,
  fallback,
  loginPrompt = true
}: ProtectedProps) {
  const auth = useWSTFAuth();

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (!auth.isAuthenticated) {
    if (loginPrompt) {
      return <LoginPrompt />;
    }
    return fallback || <div>Access denied</div>;
  }

  if (!auth.hasLevel(level)) {
    return fallback || <div>Insufficient permissions (requires {level})</div>;
  }

  if (scope && !auth.hasScope(scope)) {
    return fallback || <div>Missing required scope: {scope}</div>;
  }

  return <>{children}</>;
}

/**
 * Login prompt component
 */
export function LoginPrompt() {
  const auth = useWSTFAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    try {
      setIsLoading(true);
      setError(null);

      // This would integrate with your WSTF signer
      // For now, redirect to the auth challenge page
      window.location.href = window.location.href;

    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      textAlign: 'center'
    }}>
      <h2>🔐 Authentication Required</h2>
      <p>You need to authenticate with your WSTF public key to access this resource.</p>

      {auth.error && (
        <div style={{ color: '#dc3545', margin: '10px 0' }}>
          {auth.error}
        </div>
      )}

      {error && (
        <div style={{ color: '#dc3545', margin: '10px 0' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleLogin}
        disabled={isLoading}
        style={{
          background: '#007bff',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          marginTop: '20px'
        }}
      >
        {isLoading ? 'Authenticating...' : 'Login with WSTF'}
      </button>

      <p style={{ fontSize: '14px', color: '#666', marginTop: '20px' }}>
        Resource: {auth.resource?.name || 'Unknown'}<br />
        Required Level: read
      </p>
    </div>
  );
}

/**
 * User info display component
 */
export function UserInfo() {
  const auth = useWSTFAuth();

  if (!auth.isAuthenticated) {
    return null;
  }

  return (
    <div style={{
      background: '#f8f9fa',
      border: '1px solid #e9ecef',
      borderRadius: '4px',
      padding: '10px',
      fontSize: '14px'
    }}>
      <div><strong>User:</strong> {auth.user?.label}</div>
      <div><strong>Level:</strong> {auth.user?.level}</div>
      <div><strong>Scopes:</strong> {auth.user?.scopes.join(', ')}</div>
      <div><strong>Resource:</strong> {auth.resource?.name}</div>
      <button
        onClick={auth.logout}
        style={{
          background: '#dc3545',
          color: 'white',
          border: 'none',
          padding: '4px 8px',
          borderRadius: '2px',
          cursor: 'pointer',
          fontSize: '12px',
          marginTop: '5px'
        }}
      >
        Logout
      </button>
    </div>
  );
}

/**
 * Hook for conditional rendering based on permissions
 */
export function usePermissions() {
  const auth = useWSTFAuth();

  return {
    canRead: auth.hasLevel('read'),
    canWrite: auth.hasLevel('write'),
    canAdmin: auth.hasLevel('admin'),
    hasScope: auth.hasScope,
    hasLevel: auth.hasLevel
  };
}