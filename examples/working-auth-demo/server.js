/**
 * Working Auth Demo Server
 *
 * A complete working example server that demonstrates WSTFAuth.
 * Run this to see the auth system in action.
 *
 * Usage:
 *   cd examples/working-auth-demo
 *   node server.js
 *   Visit http://localhost:3000
 */

const express = require('express');
const path = require('path');
const { wstfAuth } = require('../../src/auth/wstf-auth');
const authRouter = require('../../src/auth/api').default;
const { serveGated, requireAuth } = require('../../src/auth/middleware');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth API
app.use('/auth', authRouter);

// =============================================================================
// DEMO SETUP
// =============================================================================

async function setupDemo() {
  console.log('🔐 Setting up WSTFAuth Demo...\n');

  try {
    // Create demo resources
    const demoResources = [
      {
        id: 'public_demo',
        name: 'Public Demo Area',
        description: 'Publicly accessible demo content',
        owner: 'gc_demo_owner_12345',
        entries: [
          {
            publicKey: 'demo_user_1_pubkey_base64',
            label: 'Demo User 1',
            level: 'read',
            scopes: ['demo_read']
          },
          {
            publicKey: 'demo_user_2_pubkey_base64',
            label: 'Demo User 2',
            level: 'write',
            scopes: ['demo_read', 'demo_write']
          }
        ]
      },
      {
        id: 'premium_demo',
        name: 'Premium Demo Area',
        description: 'Premium features demonstration',
        owner: 'gc_premium_owner_12345',
        entries: [
          {
            publicKey: 'premium_user_1_pubkey_base64',
            label: 'Premium User 1',
            level: 'admin',
            scopes: ['*']
          }
        ]
      },
      {
        id: 'bridge_demo',
        name: 'Bridge Demo',
        description: 'Cross-chain bridge demonstration',
        owner: 'gc_bridge_owner_12345',
        entries: [
          {
            publicKey: 'bridge_user_1_pubkey_base64',
            label: 'Bridge User 1',
            level: 'write',
            scopes: ['bridge_execute', 'bridge_read']
          },
          {
            publicKey: 'bridge_provider_1_pubkey_base64',
            label: 'Bridge Provider 1',
            level: 'admin',
            scopes: ['*']
          }
        ]
      }
    ];

    // Create resources
    for (const resource of demoResources) {
      wstfAuth.createResource(resource.id, resource.name, resource.owner, {
        description: resource.description,
        defaultLevel: 'read',
        allowSelfRegistration: false,
        initialEntries: resource.entries
      });

      console.log(`✅ Created resource: ${resource.name}`);
      console.log(`   ID: ${resource.id}`);
      console.log(`   Users: ${resource.entries.length}`);
      console.log('');
    }

    console.log('🎉 Demo setup complete!\n');
    console.log('📋 Available Demo Resources:');
    console.log('   1. Public Demo - Basic access control');
    console.log('   2. Premium Demo - Advanced features');
    console.log('   3. Bridge Demo - Cross-chain bridge access');
    console.log('');

  } catch (error) {
    console.error('❌ Demo setup failed:', error);
  }
}

// =============================================================================
// DEMO ROUTES
// =============================================================================

// Home page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WSTFAuth Demo</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        .card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            background: #f9f9f9;
        }
        .button {
            display: inline-block;
            background: #007bff;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            margin: 5px 5px 5px 0;
        }
        .button:hover { background: #0056b3; }
        .code {
            background: #f4f4f4;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            margin: 10px 0;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <h1>🔐 WSTFAuth Demo</h1>

    <p>This demo shows how WSTFAuth works for public key-based access control.</p>

    <div class="card">
        <h2>🌟 Demo Resources</h2>
        <p>Try accessing these protected areas:</p>

        <a href="/public-demo" class="button">Public Demo</a>
        <a href="/premium-demo" class="button">Premium Demo</a>
        <a href="/bridge-demo" class="button">Bridge Demo</a>

        <div class="warning">
            <strong>Note:</strong> These are protected areas. You'll need to authenticate with a WSTF public key to access them.
        </div>
    </div>

    <div class="card">
        <h2>🛠️ API Endpoints</h2>
        <p>Test the auth system programmatically:</p>

        <div class="code">
            GET /auth/health - Check service status<br>
            POST /auth/challenge - Request authentication challenge<br>
            POST /auth/verify-challenge - Submit signed challenge<br>
            GET /auth/resources/public_demo - Get resource info
        </div>

        <a href="/auth/health" class="button">Check API Health</a>
        <a href="/api-demo" class="button">API Demo Page</a>
    </div>

    <div class="card">
        <h2>📋 How It Works</h2>
        <ol>
            <li><strong>Create Resource:</strong> Define what you want to protect</li>
            <li><strong>Grant Access:</strong> Give specific public keys permission</li>
            <li><strong>User Accesses:</strong> Users sign challenges to prove key ownership</li>
            <li><strong>Protected Content:</strong> Only authorized users see the content</li>
        </ol>
    </div>

    <div class="card">
        <h2>🎯 Demo Users</h2>
        <p>For testing, these demo keys are pre-configured:</p>

        <div class="code">
            Demo User 1: demo_user_1_pubkey_base64 (read access)<br>
            Demo User 2: demo_user_2_pubkey_base64 (write access)<br>
            Premium User: premium_user_1_pubkey_base64 (admin access)<br>
            Bridge User: bridge_user_1_pubkey_base64 (bridge access)
        </div>

        <p><small>In production, these would be real Ed25519 public keys.</small></p>
    </div>

    <div style="text-align: center; margin-top: 40px; color: #666;">
        <p>🚀 Powered by WSTFChain Bridge System</p>
        <p><a href="https://github.com/wasserstoff-india/wstfchain">View on GitHub</a></p>
    </div>
</body>
</html>
  `);
});

// API Demo page
app.get('/api-demo', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WSTFAuth API Demo</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }
        .api-test {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        button {
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px 0;
        }
        button:hover { background: #218838; }
        .result {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
            font-family: monospace;
            white-space: pre-wrap;
        }
        .error { background: #f8d7da; border-color: #f5c6cb; }
        .success { background: #d4edda; border-color: #c3e6cb; }
    </style>
</head>
<body>
    <h1>🔧 WSTFAuth API Demo</h1>
    <p><a href="/">← Back to Main Demo</a></p>

    <div class="api-test">
        <h3>1. Check API Health</h3>
        <button onclick="testHealth()">GET /auth/health</button>
        <div id="health-result" class="result" style="display:none;"></div>
    </div>

    <div class="api-test">
        <h3>2. Get Resource Info</h3>
        <button onclick="testResourceInfo()">GET /auth/resources/public_demo</button>
        <div id="resource-result" class="result" style="display:none;"></div>
    </div>

    <div class="api-test">
        <h3>3. Request Authentication Challenge</h3>
        <button onclick="testChallenge()">POST /auth/challenge</button>
        <div id="challenge-result" class="result" style="display:none;"></div>
    </div>

    <div class="api-test">
        <h3>4. Registry Statistics</h3>
        <button onclick="testRegistry()">GET /auth/registry/stats</button>
        <div id="registry-result" class="result" style="display:none;"></div>
    </div>

    <script>
        async function testHealth() {
            const result = document.getElementById('health-result');
            result.style.display = 'block';
            result.textContent = 'Loading...';

            try {
                const response = await fetch('/auth/health');
                const data = await response.json();
                result.className = 'result success';
                result.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                result.className = 'result error';
                result.textContent = 'Error: ' + error.message;
            }
        }

        async function testResourceInfo() {
            const result = document.getElementById('resource-result');
            result.style.display = 'block';
            result.textContent = 'Loading...';

            try {
                const response = await fetch('/auth/resources/public_demo');
                const data = await response.json();
                result.className = 'result success';
                result.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                result.className = 'result error';
                result.textContent = 'Error: ' + error.message;
            }
        }

        async function testChallenge() {
            const result = document.getElementById('challenge-result');
            result.style.display = 'block';
            result.textContent = 'Loading...';

            try {
                const response = await fetch('/auth/challenge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        resourceId: 'public_demo',
                        publicKey: 'demo_user_1_pubkey_base64'
                    })
                });
                const data = await response.json();
                result.className = 'result success';
                result.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                result.className = 'result error';
                result.textContent = 'Error: ' + error.message;
            }
        }

        async function testRegistry() {
            const result = document.getElementById('registry-result');
            result.style.display = 'block';
            result.textContent = 'Loading...';

            try {
                // This would be the bridge registry stats if available
                result.className = 'result success';
                result.textContent = JSON.stringify({
                    totalResources: 3,
                    activeUsers: 5,
                    totalChallenges: 0,
                    activeSessions: 0
                }, null, 2);
            } catch (error) {
                result.className = 'result error';
                result.textContent = 'Error: ' + error.message;
            }
        }
    </script>
</body>
</html>
  `);
});

// Protected demo areas
app.use('/public-demo',
  serveGated('public_demo', path.join(__dirname, 'protected/public'), {
    level: 'read',
    indexFile: 'index.html'
  })
);

app.use('/premium-demo',
  serveGated('premium_demo', path.join(__dirname, 'protected/premium'), {
    level: 'write',
    indexFile: 'index.html'
  })
);

app.use('/bridge-demo',
  serveGated('bridge_demo', path.join(__dirname, 'protected/bridge'), {
    level: 'write',
    scope: 'bridge_execute',
    indexFile: 'index.html'
  })
);

// Protected API endpoints
app.get('/api/public-data',
  requireAuth('public_demo', { level: 'read' }),
  (req, res) => {
    res.json({
      message: 'Welcome to the public demo!',
      user: {
        publicKey: req.wstfAuth.userPublicKey,
        level: req.wstfAuth.token.level,
        scopes: req.wstfAuth.token.scopes
      },
      data: [
        { id: 1, title: 'Public Demo Item 1', description: 'This is accessible to read-level users' },
        { id: 2, title: 'Public Demo Item 2', description: 'Everyone with access can see this' }
      ]
    });
  }
);

app.get('/api/premium-data',
  requireAuth('premium_demo', { level: 'admin' }),
  (req, res) => {
    res.json({
      message: 'Welcome to premium features!',
      user: {
        publicKey: req.wstfAuth.userPublicKey,
        level: req.wstfAuth.token.level,
        scopes: req.wstfAuth.token.scopes
      },
      premiumFeatures: [
        'Advanced analytics',
        'Priority support',
        'Custom integrations',
        'White-label options'
      ]
    });
  }
);

app.get('/api/bridge-routes',
  requireAuth('bridge_demo', { level: 'read', scope: 'bridge_read' }),
  (req, res) => {
    res.json({
      message: 'Bridge routes available',
      routes: [
        {
          id: 'bsc_usdt_polygon',
          name: 'BSC USDT → Polygon USDT',
          fee: '0.3%',
          time: '3 minutes',
          provider: 'Demo Bridge Co.'
        },
        {
          id: 'ethereum_usdc_bsc',
          name: 'Ethereum USDC → BSC USDC',
          fee: '0.5%',
          time: '5 minutes',
          provider: 'Fast Bridge Inc.'
        }
      ],
      canExecute: req.wstfAuth.hasScope('bridge_execute')
    });
  }
);

app.post('/api/bridge-execute',
  requireAuth('bridge_demo', { level: 'write', scope: 'bridge_execute' }),
  (req, res) => {
    const { routeId, amount, dstAddress } = req.body;

    res.json({
      message: 'Bridge request submitted!',
      requestId: `br_${Date.now()}`,
      route: routeId,
      amount,
      dstAddress,
      estimatedTime: 180, // seconds
      submittedBy: req.wstfAuth.userPublicKey
    });
  }
);

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
  // Setup demo data
  await setupDemo();

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 WSTFAuth Demo Server running on http://localhost:${PORT}`);
    console.log('');
    console.log('📋 Try these URLs:');
    console.log(`   Main Demo: http://localhost:${PORT}/`);
    console.log(`   API Demo: http://localhost:${PORT}/api-demo`);
    console.log(`   Public Demo: http://localhost:${PORT}/public-demo`);
    console.log(`   Premium Demo: http://localhost:${PORT}/premium-demo`);
    console.log(`   Bridge Demo: http://localhost:${PORT}/bridge-demo`);
    console.log('');
    console.log('🔧 API Endpoints:');
    console.log(`   Health: http://localhost:${PORT}/auth/health`);
    console.log(`   Resource Info: http://localhost:${PORT}/auth/resources/public_demo`);
    console.log('');
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down demo server...');
  process.exit(0);
});

// Start the server
startServer().catch(console.error);