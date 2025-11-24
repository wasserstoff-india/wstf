#!/usr/bin/env node
/**
 * WSTF Kit Playground Dev Server
 *
 * Runs the docs playground with hot reload for development.
 *
 * Usage:
 *   node dev.mjs
 *   # or: npm run dev:docs
 */

import { context } from 'esbuild';
import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');

// Create public directory
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

// Copy index.html to public
copyFileSync(join(__dirname, 'docs/index.html'), join(publicDir, 'index.html'));

console.log('Starting WSTF Kit Playground...\n');

// Build options
const buildOptions = {
  entryPoints: [join(__dirname, 'docs/main.tsx')],
  bundle: true,
  outdir: publicDir,
  format: 'esm',
  platform: 'browser',
  target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
  sourcemap: true,
  minify: false,
  jsx: 'automatic',
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  // Define environment
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  // Resolve extensions
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
  // Log level
  logLevel: 'info',
};

async function startDevServer() {
  try {
    const ctx = await context(buildOptions);

    // Initial build
    await ctx.rebuild();
    console.log('Initial build complete\n');

    // Start esbuild's internal server on a different port
    const { host: esbuildHost, port: esbuildPort } = await ctx.serve({
      servedir: publicDir,
      port: 3001,
      host: 'localhost',
    });

    // WSTF API proxy configuration
    const WSTF_SERVICES = {
      // Explorer service paths (localhost:7003)
      '/account/': 'http://localhost:7003',
      '/blocks': 'http://localhost:7003',
      '/transactions': 'http://localhost:7003',
      '/username/': 'http://localhost:7003',

      // Validator/RPC service paths (localhost:7002)
      '/markets': 'http://localhost:7002',
      '/rpc': 'http://localhost:7002',

      // Accounts service paths (localhost:7001)
      '/accounts': 'http://localhost:7001',

      // API namespace paths
      '/api/rpc': 'http://localhost:7002',
      '/api/explorer': 'http://localhost:7003',
      '/api/accounts': 'http://localhost:7001',
    };

    // Create a proxy server that handles SPA routing and API proxying
    const server = http.createServer((req, res) => {
      const url = req.url || '/';

      // Check if this is an API request that needs proxying
      const apiProxy = Object.entries(WSTF_SERVICES).find(([path]) => url.startsWith(path));

      if (apiProxy) {
        const [apiPath, targetUrl] = apiProxy;
        const targetURL = new URL(targetUrl);

        // Keep the full URL path for the target, don't strip the API path
        const proxyPath = url;

        // Add CORS headers for API requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          console.log(`\x1b[32m200\x1b[0m OPTIONS ${url} (CORS preflight)`);
          return;
        }

        // Proxy API request to WSTF service
        const proxyReq = http.request(
          {
            hostname: targetURL.hostname,
            port: targetURL.port || 80,
            path: proxyPath,
            method: req.method,
            headers: {
              ...req.headers,
              host: targetURL.host,
            },
          },
          (proxyRes) => {
            // Add CORS headers to the response
            const headers = {
              ...proxyRes.headers,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            };

            res.writeHead(proxyRes.statusCode || 200, headers);
            proxyRes.pipe(res);

            const statusColor = (proxyRes.statusCode || 200) < 400 ? '\x1b[32m' : '\x1b[31m';
            console.log(`${statusColor}${proxyRes.statusCode}\x1b[0m ${req.method} ${url} -> ${targetUrl}${proxyPath}`);
          }
        );

        proxyReq.on('error', (err) => {
          console.error(`\x1b[31mProxy Error\x1b[0m ${url} ->`, err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Service unavailable', message: err.message }));
        });

        req.pipe(proxyReq);
        return;
      }

      // Regular file/SPA request - proxy to esbuild
      const proxyReq = http.request(
        {
          hostname: esbuildHost,
          port: esbuildPort,
          path: url,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          // If 404 and not a file request, serve index.html (SPA fallback)
          if (proxyRes.statusCode === 404 && !url.includes('.')) {
            const indexPath = join(publicDir, 'index.html');
            if (existsSync(indexPath)) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(readFileSync(indexPath));
              console.log(`\x1b[32m200\x1b[0m ${req.method} ${url} (SPA fallback)`);
              return;
            }
          }

          // Forward the response
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);

          const statusColor = (proxyRes.statusCode || 200) < 400 ? '\x1b[32m' : '\x1b[31m';
          console.log(`${statusColor}${proxyRes.statusCode}\x1b[0m ${req.method} ${url}`);
        }
      );

      req.pipe(proxyReq);
    });

    const PORT = 3000;
    server.listen(PORT, 'localhost', () => {
      console.log(`
================================================================================
  WSTF Kit Playground
================================================================================
  Local:    http://localhost:${PORT}

  Make sure your devnet is running:
    npm run start:dev

  Or start with specific services:
    npm run start -- --profile=dev --services=accounts,validator,explorer
================================================================================
`);
    });

    // Watch for changes
    await ctx.watch();

  } catch (error) {
    console.error('Failed to start dev server:', error);
    process.exit(1);
  }
}

startDevServer();
