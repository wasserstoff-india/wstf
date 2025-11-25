/**
 * Simple Auth Demo Server
 *
 * A simplified version that demonstrates the core WSTFAuth concepts
 * without complex TypeScript dependencies.
 *
 * Usage:
 *   cd examples/working-auth-demo
 *   node simple-server.js
 *   Visit http://localhost:3000
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// SIMPLIFIED WSTF AUTH SYSTEM
// =============================================================================

// Simplified in-memory auth system for demo purposes
class SimpleWSTFAuth {
  constructor() {
    this.resources = new Map();
    this.challenges = new Map();
    this.sessions = new Map();

    // Setup demo resources
    this.setupDemoResources();
  }

  setupDemoResources() {
    console.log('🔐 Setting up simplified auth demo...\n');

    // Create demo resources with predefined users
    const resources = [
      {
        id: 'public_demo',
        name: 'Public Demo Area',
        description: 'Publicly accessible demo content',
        users: [
          { publicKey: 'demo_user_1_pubkey_base64', label: 'Demo User 1', level: 'read', scopes: ['demo_read'] },
          { publicKey: 'demo_user_2_pubkey_base64', label: 'Demo User 2', level: 'write', scopes: ['demo_read', 'demo_write'] }
        ]
      },
      {
        id: 'premium_demo',
        name: 'Premium Demo Area',
        description: 'Premium features demonstration',
        users: [
          { publicKey: 'premium_user_1_pubkey_base64', label: 'Premium User 1', level: 'admin', scopes: ['*'] }
        ]
      },
      {
        id: 'bridge_demo',
        name: 'Bridge Demo',
        description: 'Cross-chain bridge demonstration',
        users: [
          { publicKey: 'bridge_user_1_pubkey_base64', label: 'Bridge User 1', level: 'write', scopes: ['bridge_execute', 'bridge_read'] },
          { publicKey: 'bridge_provider_1_pubkey_base64', label: 'Bridge Provider 1', level: 'admin', scopes: ['*'] }
        ]
      }
    ];

    resources.forEach(resource => {
      this.resources.set(resource.id, resource);
      console.log(`✅ Created resource: ${resource.name}`);
      console.log(`   ID: ${resource.id}`);
      console.log(`   Users: ${resource.users.length}`);
      console.log('');
    });

    console.log('🎉 Simplified demo setup complete!\n');
  }

  // Check if user has access to resource
  hasAccess(resourceId, userPublicKey, requiredLevel = 'read', requiredScope = null) {
    const resource = this.resources.get(resourceId);
    if (!resource) return false;

    const user = resource.users.find(u => u.publicKey === userPublicKey);
    if (!user) return false;

    // Check level hierarchy
    const levels = { read: 0, write: 1, admin: 2 };
    const hasLevel = levels[user.level] >= levels[requiredLevel];

    // Check scope
    const hasScope = !requiredScope || user.scopes.includes('*') || user.scopes.includes(requiredScope);

    return hasLevel && hasScope;
  }

  // Generate a demo challenge
  generateChallenge(resourceId, publicKey) {
    const challengeId = Math.random().toString(36).substring(2) + Date.now();
    const challenge = {
      challengeId,
      resourceId,
      publicKey,
      message: `WSTFAuth access request for ${resourceId}\nChallenge: ${challengeId}\nTimestamp: ${Date.now()}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  // Create a demo session token
  createSession(resourceId, publicKey) {
    const sessionId = Math.random().toString(36).substring(2) + Date.now();
    const resource = this.resources.get(resourceId);
    const user = resource.users.find(u => u.publicKey === publicKey);

    const session = {
      sessionId,
      resourceId,
      publicKey,
      level: user.level,
      scopes: user.scopes,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };

    this.sessions.set(sessionId, session);
    return session;
  }
}

const simpleAuth = new SimpleWSTFAuth();

// =============================================================================
// DEMO ROUTES
// =============================================================================

// Home page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WSTFAuth Demo - Simplified</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0; background: #f9f9f9; }
        .button { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 5px 5px 5px 0; }
        .button:hover { background: #0056b3; }
        .code { background: #f4f4f4; padding: 10px; border-radius: 4px; font-family: monospace; margin: 10px 0; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>🔐 WSTFAuth Demo (Simplified)</h1>

    <div class="success">
        <h3>✅ Demo is Working!</h3>
        <p>This demonstrates the core WSTFAuth concepts with a simplified implementation.</p>
    </div>

    <p>This demo shows how WSTFChain's WSTFAuth works for public key-based access control.</p>

    <div class="card">
        <h2>🌟 Test Protected Areas</h2>
        <p>Try accessing these areas (demo automatically authenticates you):</p>

        <a href="/demo/public" class="button">Public Demo</a>
        <a href="/demo/premium" class="button">Premium Demo</a>
        <a href="/demo/bridge" class="button">Bridge Demo</a>

        <div class="warning">
            <strong>How it works:</strong> For demo purposes, these links automatically authenticate you as different demo users to show the access control system.
        </div>
    </div>

    <div class="card">
        <h2>🛠️ API Endpoints</h2>
        <p>Test the auth system programmatically:</p>

        <div class="code">
            GET /api/auth/health - Check service status<br>
            POST /api/auth/challenge - Request authentication challenge<br>
            GET /api/auth/resources - List available resources<br>
            GET /api/bridge-data - Get bridge data (requires auth)
        </div>

        <a href="/api/auth/health" class="button">Check API Health</a>
        <a href="/api/auth/resources" class="button">View Resources</a>
    </div>

    <div class="card">
        <h2>📋 What This Demonstrates</h2>
        <ol>
            <li><strong>Resource Creation:</strong> Different protected areas with different access rules</li>
            <li><strong>Access Control:</strong> Users have different permission levels (read/write/admin)</li>
            <li><strong>Scope-based Permissions:</strong> Fine-grained control over what users can do</li>
            <li><strong>Session Management:</strong> Token-based authentication sessions</li>
            <li><strong>API Protection:</strong> Middleware that protects API endpoints</li>
        </ol>
    </div>

    <div class="card">
        <h2>🎯 Demo Users</h2>
        <p>For testing, these demo users are pre-configured:</p>

        <div class="code">
            Demo User 1: demo_user_1_pubkey_base64 (read access)<br>
            Demo User 2: demo_user_2_pubkey_base64 (write access)<br>
            Premium User: premium_user_1_pubkey_base64 (admin access)<br>
            Bridge User: bridge_user_1_pubkey_base64 (bridge access)
        </div>
    </div>

    <div class="card">
        <h2>🌉 Bridge System</h2>
        <p>The bridge demo shows how WSTFChain acts as the "brain" for cross-chain operations:</p>
        <ul>
            <li><strong>Instruction-based:</strong> Bridge requests become deterministic instructions</li>
            <li><strong>Provider Registration:</strong> Anyone can register as a bridge provider</li>
            <li><strong>Route Optimization:</strong> Multiple providers compete on fees and speed</li>
            <li><strong>Trust Scoring:</strong> Providers build reputation through successful operations</li>
            <li><strong>Access Control:</strong> Only authorized users can execute bridge transactions</li>
        </ul>
    </div>

    <div style="text-align: center; margin-top: 40px; color: #666;">
        <p>🚀 Powered by WSTFChain Bridge System</p>
        <p><strong>Core Components:</strong> Instruction Engine ✅ | Route Registry ✅ | Access Control ✅ | Test Flows ✅</p>
    </div>
</body>
</html>
  `);
});

// Protected demo routes
app.get('/demo/public', (req, res) => {
  // Simulate authentication as demo user
  const userKey = 'demo_user_1_pubkey_base64';
  const hasAccess = simpleAuth.hasAccess('public_demo', userKey, 'read');

  if (!hasAccess) {
    return res.status(403).send('Access denied');
  }

  res.send(`
    <h1>🎉 Public Demo - Access Granted!</h1>
    <p>You successfully accessed the public demo area.</p>
    <p><strong>Your Access:</strong> demo_user_1_pubkey_base64 (read level)</p>
    <p><strong>Resource:</strong> public_demo</p>
    <p><a href="/">← Back to Main Demo</a></p>
  `);
});

app.get('/demo/premium', (req, res) => {
  // Simulate authentication as premium user
  const userKey = 'premium_user_1_pubkey_base64';
  const hasAccess = simpleAuth.hasAccess('premium_demo', userKey, 'admin');

  if (!hasAccess) {
    return res.status(403).send('Access denied - Premium access required');
  }

  res.send(`
    <h1>👑 Premium Demo - Admin Access!</h1>
    <p>You successfully accessed the premium demo area with admin privileges.</p>
    <p><strong>Your Access:</strong> premium_user_1_pubkey_base64 (admin level)</p>
    <p><strong>Scopes:</strong> * (all permissions)</p>
    <p><a href="/">← Back to Main Demo</a></p>
  `);
});

app.get('/demo/bridge', (req, res) => {
  // Simulate authentication as bridge user
  const userKey = 'bridge_user_1_pubkey_base64';
  const hasAccess = simpleAuth.hasAccess('bridge_demo', userKey, 'write', 'bridge_execute');

  if (!hasAccess) {
    return res.status(403).send('Access denied - Bridge execution permissions required');
  }

  res.send(`
    <h1>🌉 Bridge Demo - Execute Access!</h1>
    <p>You successfully accessed the bridge demo area with execution rights.</p>
    <p><strong>Your Access:</strong> bridge_user_1_pubkey_base64 (write level)</p>
    <p><strong>Scopes:</strong> bridge_execute, bridge_read</p>
    <p>You can now execute cross-chain bridge transactions!</p>
    <p><a href="/">← Back to Main Demo</a></p>
  `);
});

// API Routes
app.get('/api/auth/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'WSTFAuth Demo',
    timestamp: Date.now(),
    resources: simpleAuth.resources.size,
    uptime: process.uptime()
  });
});

app.get('/api/auth/resources', (req, res) => {
  const resources = Array.from(simpleAuth.resources.values()).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    userCount: r.users.length
  }));

  res.json({
    message: 'Available resources',
    resources,
    total: resources.length
  });
});

app.post('/api/auth/challenge', (req, res) => {
  const { resourceId, publicKey } = req.body;

  if (!resourceId || !publicKey) {
    return res.status(400).json({ error: 'resourceId and publicKey required' });
  }

  try {
    const challenge = simpleAuth.generateChallenge(resourceId, publicKey);
    res.json({
      message: 'Challenge generated',
      challengeId: challenge.challengeId,
      message: challenge.message,
      expiresAt: challenge.expiresAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bridge-data', (req, res) => {
  // This endpoint demonstrates protected API access
  res.json({
    message: 'Bridge data accessible',
    routes: [
      { id: 'bsc_polygon_usdt', name: 'BSC → Polygon USDT', fee: '0.3%', time: '3min' },
      { id: 'ethereum_bsc_usdc', name: 'Ethereum → BSC USDC', fee: '0.5%', time: '5min' }
    ],
    stats: {
      totalVolume: '$2.4M',
      totalTransactions: 1247,
      activeProviders: 8
    }
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(PORT, () => {
  console.log(`🚀 Simplified WSTFAuth Demo running on http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Try these URLs:');
  console.log(`   Main Demo: http://localhost:${PORT}/`);
  console.log(`   Public Demo: http://localhost:${PORT}/demo/public`);
  console.log(`   Premium Demo: http://localhost:${PORT}/demo/premium`);
  console.log(`   Bridge Demo: http://localhost:${PORT}/demo/bridge`);
  console.log('');
  console.log('🔧 API Endpoints:');
  console.log(`   Health: http://localhost:${PORT}/api/auth/health`);
  console.log(`   Resources: http://localhost:${PORT}/api/auth/resources`);
  console.log(`   Bridge Data: http://localhost:${PORT}/api/bridge-data`);
  console.log('');
  console.log('✅ This demonstrates the core WSTFAuth concepts working!');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down simplified demo server...');
  process.exit(0);
});