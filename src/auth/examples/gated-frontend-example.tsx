/**
 * Gated Frontend Example
 *
 * Complete example showing how to create an access-gated frontend
 * using WSTFAuth components and middleware.
 */

import React, { useEffect, useState } from 'react';
import express from 'express';
import path from 'path';
import {
  WSTFAuthProvider,
  useWSTFAuth,
  Protected,
  UserInfo,
  LoginPrompt,
  usePermissions
} from '../react/WSTFAuthProvider';
import { serveGated, requireAuth } from '../middleware';
import authRouter from '../api';
import { wstfAuth } from '../wstf-auth';

// ============================================================================
// BACKEND SETUP
// ============================================================================

/**
 * Example Express server setup for gated frontend
 */
function setupGatedServer() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.static('public'));

  // Auth API routes
  app.use('/auth', authRouter);

  // Create some example gated resources
  setupExampleResources();

  // Serve gated admin dashboard
  app.use('/admin/*',
    serveGated('admin_dashboard', path.join(__dirname, 'admin-build'), {
      level: 'admin',
      scope: 'admin_access'
    })
  );

  // Serve gated user portal
  app.use('/portal/*',
    serveGated('user_portal', path.join(__dirname, 'portal-build'), {
      level: 'read'
    })
  );

  // Serve gated API documentation
  app.use('/docs/*',
    serveGated('api_docs', path.join(__dirname, 'docs-build'), {
      level: 'read',
      scope: 'docs'
    })
  );

  // Protected API endpoints
  app.get('/api/admin/users',
    requireAuth('admin_dashboard', { level: 'admin' }),
    (req, res) => {
      res.json({
        ok: true,
        users: ['user1', 'user2', 'user3'], // Mock data
        requestedBy: req.wstfAuth!.userPublicKey
      });
    }
  );

  app.get('/api/user/profile',
    requireAuth('user_portal', { level: 'read' }),
    (req, res) => {
      res.json({
        ok: true,
        profile: {
          publicKey: req.wstfAuth!.userPublicKey,
          level: req.wstfAuth!.token.level,
          scopes: req.wstfAuth!.token.scopes
        }
      });
    }
  );

  // Bridge API with access control
  app.get('/api/bridge/routes',
    requireAuth('bridge_access', { level: 'read', scope: 'bridge_read' }),
    (req, res) => {
      // Return bridge routes (from previous bridge system)
      res.json({
        ok: true,
        routes: ['route1', 'route2'], // Mock data
        accessLevel: req.wstfAuth!.token.level
      });
    }
  );

  app.post('/api/bridge/request',
    requireAuth('bridge_access', { level: 'write', scope: 'bridge_execute' }),
    (req, res) => {
      // Handle bridge request
      res.json({
        ok: true,
        requestId: 'req_' + Date.now(),
        submittedBy: req.wstfAuth!.userPublicKey
      });
    }
  );

  return app;
}

/**
 * Setup example access-controlled resources
 */
function setupExampleResources() {
  // Admin Dashboard - only for administrators
  wstfAuth.createResource('admin_dashboard', 'Admin Dashboard', 'gc_admin_owner_key', {
    description: 'Administrative control panel',
    defaultLevel: 'admin',
    allowSelfRegistration: false,
    initialEntries: [
      {
        publicKey: 'gc_admin_user_1',
        label: 'Admin User 1',
        level: 'admin',
        scopes: ['*']
      },
      {
        publicKey: 'gc_admin_user_2',
        label: 'Admin User 2',
        level: 'admin',
        scopes: ['admin_access', 'user_management']
      }
    ]
  });

  // User Portal - for general users
  wstfAuth.createResource('user_portal', 'User Portal', 'gc_portal_owner_key', {
    description: 'User dashboard and profile management',
    defaultLevel: 'read',
    allowSelfRegistration: true,
    initialEntries: [
      {
        publicKey: 'gc_user_1',
        label: 'Regular User 1',
        level: 'read',
        scopes: ['profile', 'settings']
      },
      {
        publicKey: 'gc_user_2',
        label: 'Premium User',
        level: 'write',
        scopes: ['profile', 'settings', 'premium_features']
      }
    ]
  });

  // API Documentation
  wstfAuth.createResource('api_docs', 'API Documentation', 'gc_docs_owner_key', {
    description: 'Technical API documentation',
    defaultLevel: 'read',
    allowSelfRegistration: false,
    initialEntries: [
      {
        publicKey: 'gc_developer_1',
        label: 'Developer 1',
        level: 'read',
        scopes: ['docs']
      }
    ]
  });

  // Bridge Access - for bridge users
  wstfAuth.createResource('bridge_access', 'Bridge Platform', 'gc_bridge_owner_key', {
    description: 'Cross-chain bridge access',
    defaultLevel: 'read',
    allowSelfRegistration: false,
    initialEntries: [
      {
        publicKey: 'gc_bridge_user_1',
        label: 'Bridge User 1',
        level: 'write',
        scopes: ['bridge_read', 'bridge_execute']
      },
      {
        publicKey: 'gc_bridge_provider_1',
        label: 'Bridge Provider 1',
        level: 'admin',
        scopes: ['*']
      }
    ]
  });
}

// ============================================================================
// FRONTEND COMPONENTS
// ============================================================================

/**
 * Main gated application component
 */
function GatedApp() {
  return (
    <WSTFAuthProvider resourceId="user_portal" apiBaseUrl="/auth">
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header />
        <main style={{ padding: '20px' }}>
          <AppContent />
        </main>
      </div>
    </WSTFAuthProvider>
  );
}

/**
 * Application header with authentication status
 */
function Header() {
  const auth = useWSTFAuth();

  return (
    <header style={{
      background: '#343a40',
      color: 'white',
      padding: '10px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <h1>🚀 WSTF Gated Portal</h1>

      {auth.isAuthenticated ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span>Welcome, {auth.user?.label}</span>
          <button
            onClick={auth.logout}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      ) : (
        <span>Not authenticated</span>
      )}
    </header>
  );
}

/**
 * Main application content with protection levels
 */
function AppContent() {
  const auth = useWSTFAuth();

  if (auth.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <h2>🔄 Loading...</h2>
        <p>Checking authentication status...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginPrompt />;
  }

  return (
    <div>
      <UserInfo />

      <div style={{ marginTop: '30px', display: 'grid', gap: '20px' }}>
        {/* Public content */}
        <Section title="📢 Public Information">
          <p>This content is visible to all authenticated users.</p>
          <p>Current time: {new Date().toLocaleString()}</p>
        </Section>

        {/* Read-level content */}
        <Protected level="read">
          <Section title="📖 Read Access Content">
            <p>This content requires read access level.</p>
            <UserProfile />
          </Section>
        </Protected>

        {/* Write-level content */}
        <Protected level="write" fallback={<div>⚠️ Write access required</div>}>
          <Section title="✏️ Write Access Content">
            <p>This content requires write access level.</p>
            <EditableProfile />
          </Section>
        </Protected>

        {/* Admin-level content */}
        <Protected level="admin" fallback={<div>⚠️ Admin access required</div>}>
          <Section title="👑 Admin Content">
            <p>This content requires admin access level.</p>
            <AdminPanel />
          </Section>
        </Protected>

        {/* Scope-based content */}
        <Protected scope="premium_features" fallback={<div>⚠️ Premium features not available</div>}>
          <Section title="⭐ Premium Features">
            <p>This content requires premium scope.</p>
            <PremiumFeatures />
          </Section>
        </Protected>

        {/* Bridge access */}
        <BridgeSection />
      </div>
    </div>
  );
}

/**
 * Reusable section component
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '20px'
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * User profile component
 */
function UserProfile() {
  const auth = useWSTFAuth();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch('/api/user/profile', {
      headers: {
        'Authorization': `Bearer ${btoa(JSON.stringify(auth.token))}`
      }
    })
    .then(res => res.json())
    .then(data => setProfile(data.profile))
    .catch(console.error);
  }, []);

  return (
    <div>
      <h4>Your Profile</h4>
      {profile ? (
        <pre>{JSON.stringify(profile, null, 2)}</pre>
      ) : (
        <p>Loading profile...</p>
      )}
    </div>
  );
}

/**
 * Editable profile (write access required)
 */
function EditableProfile() {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div>
      <h4>Profile Settings</h4>
      <button
        onClick={() => setIsEditing(!isEditing)}
        style={{
          background: '#28a745',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        {isEditing ? 'Cancel Edit' : 'Edit Profile'}
      </button>

      {isEditing && (
        <div style={{ marginTop: '10px' }}>
          <p>✏️ Profile editing interface would be here</p>
          <p>Only users with write access can see this.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Admin panel (admin access required)
 */
function AdminPanel() {
  const auth = useWSTFAuth();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch('/api/admin/users', {
      headers: {
        'Authorization': `Bearer ${btoa(JSON.stringify(auth.token))}`
      }
    })
    .then(res => res.json())
    .then(data => setUsers(data.users))
    .catch(console.error);
  }, []);

  return (
    <div>
      <h4>User Management</h4>
      <p>Admin functions:</p>
      <ul>
        {users.map((user, i) => (
          <li key={i}>{user}</li>
        ))}
      </ul>
      <button style={{
        background: '#dc3545',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer',
        marginTop: '10px'
      }}>
        Manage Users
      </button>
    </div>
  );
}

/**
 * Premium features (scope-based access)
 */
function PremiumFeatures() {
  return (
    <div>
      <h4>Premium Dashboard</h4>
      <p>⭐ Advanced analytics</p>
      <p>⭐ Priority support</p>
      <p>⭐ Custom integrations</p>
    </div>
  );
}

/**
 * Bridge section with different resource access
 */
function BridgeSection() {
  const permissions = usePermissions();
  const auth = useWSTFAuth();
  const [bridgeRoutes, setBridgeRoutes] = useState([]);
  const [bridgeError, setBridgeError] = useState(null);

  // Try to access bridge API
  useEffect(() => {
    // Note: This would require a separate auth token for bridge_access resource
    // For demo purposes, we'll show access denied
    setBridgeError('Bridge access requires separate authentication');
  }, []);

  return (
    <Section title="🌉 Bridge Platform">
      <p>Cross-chain bridge functionality</p>

      {bridgeError ? (
        <div style={{ color: '#dc3545' }}>
          ⚠️ {bridgeError}
        </div>
      ) : (
        <div>
          <h4>Available Routes</h4>
          {bridgeRoutes.length > 0 ? (
            <ul>
              {bridgeRoutes.map((route, i) => (
                <li key={i}>{route}</li>
              ))}
            </ul>
          ) : (
            <p>Loading routes...</p>
          )}

          {permissions.canWrite && (
            <button style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '10px'
            }}>
              Create Bridge Request
            </button>
          )}
        </div>
      )}

      <p style={{ fontSize: '14px', color: '#666', marginTop: '15px' }}>
        Note: Bridge functionality requires separate authentication to the bridge_access resource.
      </p>
    </Section>
  );
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/**
 * Example usage instructions
 */
export const USAGE_EXAMPLE = `
// 1. Setup Express server with gated routes
const app = setupGatedServer();
app.listen(3000);

// 2. Create gated resources
wstfAuth.createResource('my_app', 'My App', ownerPublicKey);

// 3. Grant access to users
wstfAuth.grantAccess('my_app', userPublicKey, ownerPublicKey, {
  level: 'read',
  scopes: ['basic_access']
});

// 4. Use in React app
<WSTFAuthProvider resourceId="my_app">
  <Protected level="read">
    <MyProtectedComponent />
  </Protected>
</WSTFAuthProvider>

// 5. Protect API endpoints
app.get('/api/protected', requireAuth('my_app', { level: 'read' }), handler);

// 6. Serve gated static files
app.use('/gated/*', serveGated('my_app', './gated-build'));
`;

export {
  GatedApp,
  setupGatedServer,
  setupExampleResources
};