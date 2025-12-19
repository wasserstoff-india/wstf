/**
 * WSTFAuth Express Middleware
 *
 * Middleware functions for protecting Express routes with WSTFAuth.
 * Provides both API endpoint protection and gated frontend serving.
 */

import { Request, Response, NextFunction } from 'express';
import { wstfAuth, WSTFAuthToken, AccessControlList } from './wstf-auth';

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      wstfAuth?: {
        token: WSTFAuthToken;
        acl: AccessControlList;
        userPublicKey: string;
        hasScope: (scope: string) => boolean;
        hasLevel: (level: 'read' | 'write' | 'admin') => boolean;
      };
    }
  }
}

/**
 * Authentication middleware for API endpoints
 */
export function requireAuth(
  resourceId: string,
  options: {
    level?: 'read' | 'write' | 'admin';
    scope?: string;
    onUnauthorized?: (req: Request, res: Response) => void;
  } = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract token from Authorization header or query parameter
      let tokenData: WSTFAuthToken | null = null;

      // Try Authorization header first
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const tokenB64 = authHeader.substring(7);
          tokenData = JSON.parse(Buffer.from(tokenB64, 'base64').toString());
        } catch (e) {
          // Invalid format, continue to other methods
        }
      }

      // Try query parameter
      if (!tokenData && req.query.wstf_token) {
        try {
          tokenData = JSON.parse(Buffer.from(req.query.wstf_token as string, 'base64').toString());
        } catch (e) {
          // Invalid format
        }
      }

      // Try cookie
      if (!tokenData && req.cookies?.wstf_auth) {
        try {
          tokenData = JSON.parse(Buffer.from(req.cookies.wstf_auth, 'base64').toString());
        } catch (e) {
          // Invalid format
        }
      }

      if (!tokenData) {
        if (options.onUnauthorized) {
          options.onUnauthorized(req, res);
          return;
        }
        return res.status(401).json({
          ok: false,
          error: 'No authentication token provided',
          authRequired: {
            resourceId,
            level: options.level || 'read',
            scope: options.scope
          }
        });
      }

      // Validate token
      if (!wstfAuth.validateToken(tokenData)) {
        if (options.onUnauthorized) {
          options.onUnauthorized(req, res);
          return;
        }
        return res.status(401).json({
          ok: false,
          error: 'Invalid or expired token'
        });
      }

      // Check resource match
      if (tokenData.aud !== resourceId) {
        if (options.onUnauthorized) {
          options.onUnauthorized(req, res);
          return;
        }
        return res.status(403).json({
          ok: false,
          error: 'Token not valid for this resource'
        });
      }

      // Check permissions
      const hasPermission = wstfAuth.hasPermission(
        resourceId,
        tokenData.sub,
        options.level || 'read',
        options.scope
      );

      if (!hasPermission) {
        if (options.onUnauthorized) {
          options.onUnauthorized(req, res);
          return;
        }
        return res.status(403).json({
          ok: false,
          error: 'Insufficient permissions',
          required: {
            level: options.level || 'read',
            scope: options.scope
          },
          actual: {
            level: tokenData.level,
            scopes: tokenData.scopes
          }
        });
      }

      // Attach auth info to request
      const acl = wstfAuth.getACL(resourceId)!;
      req.wstfAuth = {
        token: tokenData,
        acl,
        userPublicKey: tokenData.sub,
        hasScope: (scope: string) =>
          tokenData.scopes.includes('*') || tokenData.scopes.includes(scope),
        hasLevel: (level: 'read' | 'write' | 'admin') => {
          const levelHierarchy = { read: 0, write: 1, admin: 2 };
          return levelHierarchy[tokenData.level] >= levelHierarchy[level];
        }
      };

      next();

    } catch (error) {
      if (options.onUnauthorized) {
        options.onUnauthorized(req, res);
        return;
      }
      res.status(500).json({
        ok: false,
        error: 'Authentication error',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Serve gated static files with authentication
 */
export function serveGated(
  resourceId: string,
  staticPath: string,
  options: {
    level?: 'read' | 'write' | 'admin';
    scope?: string;
    loginPage?: string;
    indexFile?: string;
  } = {}
) {
  const express = require('express');
  const path = require('path');
  const fs = require('fs');

  return (req: Request, res: Response, next: NextFunction) => {
    // First check authentication
    const authMiddleware = requireAuth(resourceId, {
      level: options.level || 'read',
      scope: options.scope,
      onUnauthorized: (req, res) => {
        // Serve login/challenge page instead of 401
        if (options.loginPage) {
          return res.sendFile(path.resolve(options.loginPage));
        }

        // Generate challenge for authentication
        const challenge = wstfAuth.generateChallenge(resourceId);

        // Serve authentication challenge page
        const challengePage = generateChallengePage(challenge, req.originalUrl);
        res.setHeader('Content-Type', 'text/html');
        res.send(challengePage);
      }
    });

    authMiddleware(req, res, () => {
      // Authentication successful, serve static files
      const staticMiddleware = express.static(staticPath, {
        index: options.indexFile || 'index.html'
      });
      staticMiddleware(req, res, next);
    });
  };
}

/**
 * Generate authentication challenge page
 */
function generateChallengePage(challenge: any, returnUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WSTFAuth - Access Required</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 100px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .logo {
            text-align: center;
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 30px;
            color: #333;
        }
        .challenge-box {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 15px;
            margin: 20px 0;
            font-family: monospace;
            font-size: 0.9em;
            word-break: break-all;
        }
        .form-group {
            margin: 20px 0;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input[type="text"] {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
        }
        button {
            background: #007bff;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
        }
        button:hover {
            background: #0056b3;
        }
        .error {
            color: #dc3545;
            margin-top: 10px;
        }
        .info {
            color: #6c757d;
            font-size: 0.9em;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🔐 WSTFAuth</div>

        <h2>Access Required</h2>
        <p>This resource requires authentication with your WSTF public key.</p>

        <div class="form-group">
            <label>Challenge Message:</label>
            <div class="challenge-box">${challenge.message}</div>
        </div>

        <form id="authForm">
            <div class="form-group">
                <label for="publicKey">Your WSTF Public Key:</label>
                <input type="text" id="publicKey" name="publicKey" placeholder="Base64 encoded public key" required>
            </div>

            <div class="form-group">
                <label for="signature">Signature:</label>
                <input type="text" id="signature" name="signature" placeholder="Base64 encoded signature of the challenge" required>
            </div>

            <button type="submit">Authenticate</button>

            <div class="info">
                Challenge ID: ${challenge.challengeId}<br>
                Resource: ${challenge.resourceId}<br>
                Expires: ${new Date(challenge.expiresAt).toLocaleString()}
            </div>

            <div id="error" class="error"></div>
        </form>
    </div>

    <script>
        document.getElementById('authForm').onsubmit = async (e) => {
            e.preventDefault();

            const formData = new FormData(e.target);
            const publicKey = formData.get('publicKey');
            const signature = formData.get('signature');

            try {
                const response = await fetch('/auth/verify-challenge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        challengeId: '${challenge.challengeId}',
                        publicKey,
                        signature
                    })
                });

                const result = await response.json();

                if (result.ok) {
                    // Store token and redirect
                    const tokenB64 = btoa(JSON.stringify(result.token));
                    document.cookie = \`wstf_auth=\${tokenB64}; path=/; secure; samesite=strict\`;
                    window.location.href = '${returnUrl}';
                } else {
                    document.getElementById('error').textContent = result.error;
                }

            } catch (error) {
                document.getElementById('error').textContent = 'Authentication failed: ' + error.message;
            }
        };
    </script>
</body>
</html>`;
}

/**
 * Middleware for handling challenge verification
 */
export function challengeVerificationHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { challengeId, publicKey, signature } = req.body;

      if (!challengeId || !publicKey || !signature) {
        return res.status(400).json({
          ok: false,
          error: 'Missing required fields: challengeId, publicKey, signature'
        });
      }

      const token = wstfAuth.verifyChallenge(challengeId, signature, publicKey);

      if (!token) {
        return res.status(401).json({
          ok: false,
          error: 'Authentication failed'
        });
      }

      res.json({
        ok: true,
        token,
        expiresAt: token.exp
      });

    } catch (error) {
      return res.status(401).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Middleware to extract user info from any valid token (optional auth)
 */
export function optionalAuth(resourceId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Try to extract and validate token, but don't fail if missing
    try {
      let tokenData: WSTFAuthToken | null = null;

      // Same extraction logic as requireAuth
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          tokenData = JSON.parse(Buffer.from(authHeader.substring(7), 'base64').toString());
        } catch (e) { }
      }

      if (!tokenData && req.query.wstf_token) {
        try {
          tokenData = JSON.parse(Buffer.from(req.query.wstf_token as string, 'base64').toString());
        } catch (e) { }
      }

      if (!tokenData && req.cookies?.wstf_auth) {
        try {
          tokenData = JSON.parse(Buffer.from(req.cookies.wstf_auth, 'base64').toString());
        } catch (e) { }
      }

      if (tokenData && wstfAuth.validateToken(tokenData) && tokenData.aud === resourceId) {
        const acl = wstfAuth.getACL(resourceId)!;
        req.wstfAuth = {
          token: tokenData,
          acl,
          userPublicKey: tokenData.sub,
          hasScope: (scope: string) =>
            tokenData.scopes.includes('*') || tokenData.scopes.includes(scope),
          hasLevel: (level: 'read' | 'write' | 'admin') => {
            const levelHierarchy = { read: 0, write: 1, admin: 2 };
            return levelHierarchy[tokenData.level] >= levelHierarchy[level];
          }
        };
      }

      next();

    } catch (error) {
      // Optional auth - continue even if error
      next();
    }
  };
}

/**
 * Logout middleware
 */
export function logout() {
  return (req: Request, res: Response) => {
    // Revoke session if authenticated
    if (req.wstfAuth?.token?.sessionId) {
      wstfAuth.revokeToken(req.wstfAuth.token.sessionId);
    }

    // Clear cookie
    res.clearCookie('wstf_auth');

    res.json({
      ok: true,
      message: 'Logged out successfully'
    });
  };
}

/**
 * Get current user info
 */
export function userInfo() {
  return (req: Request, res: Response) => {
    if (!req.wstfAuth) {
      return res.status(401).json({
        ok: false,
        error: 'Not authenticated'
      });
    }

    const { token, acl } = req.wstfAuth;
    const entry = acl.entries.find(e => e.publicKey === token.sub);

    res.json({
      ok: true,
      user: {
        publicKey: token.sub,
        label: entry?.label || 'Unknown User',
        level: token.level,
        scopes: token.scopes,
        sessionId: token.sessionId,
        expiresAt: token.exp,
        resource: {
          id: acl.resourceId,
          name: acl.name,
          owner: acl.owner
        }
      }
    });
  };
}