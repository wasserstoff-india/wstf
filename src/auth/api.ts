/**
 * WSTFAuth API Routes
 *
 * Express routes for WSTFAuth authentication endpoints.
 * Handles challenge generation, verification, and token management.
 */

import express from 'express';
import { wstfAuth } from './wstf-auth';
import {
  requireAuth,
  challengeVerificationHandler,
  optionalAuth,
  logout,
  userInfo
} from './middleware';

const router = express.Router();

/**
 * POST /auth/challenge
 * Generate authentication challenge for a resource
 */
router.post('/challenge', async (req, res) => {
  try {
    const { resourceId, publicKey } = req.body;

    if (!resourceId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing resourceId'
      });
    }

    // Check if resource exists
    const acl = wstfAuth.getACL(resourceId);
    if (!acl) {
      return res.status(404).json({
        ok: false,
        error: 'Resource not found'
      });
    }

    // Generate challenge
    const challenge = wstfAuth.generateChallenge(resourceId, publicKey);

    res.json({
      ok: true,
      challenge: {
        challengeId: challenge.challengeId,
        message: challenge.message,
        resourceId: challenge.resourceId,
        expiresAt: challenge.expiresAt
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Challenge generation failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * POST /auth/verify-challenge
 * Verify signed challenge and issue authentication token
 */
router.post('/verify-challenge', challengeVerificationHandler());

/**
 * POST /auth/logout
 * Logout user and revoke session
 */
router.post('/logout', logout());

/**
 * GET /auth/user-info
 * Get current user information (requires authentication)
 */
router.get('/user-info', optionalAuth('*'), userInfo());

/**
 * POST /auth/resources
 * Create a new access-controlled resource (admin only)
 */
router.post('/resources', async (req, res) => {
  try {
    const {
      resourceId,
      name,
      description,
      owner,
      defaultLevel,
      allowSelfRegistration,
      initialEntries
    } = req.body;

    if (!resourceId || !name || !owner) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: resourceId, name, owner'
      });
    }

    const acl = wstfAuth.createResource(resourceId, name, owner, {
      description,
      defaultLevel,
      allowSelfRegistration,
      initialEntries
    });

    res.json({
      ok: true,
      resource: {
        resourceId: acl.resourceId,
        name: acl.name,
        description: acl.description,
        owner: acl.owner,
        defaultLevel: acl.defaultLevel,
        allowSelfRegistration: acl.allowSelfRegistration,
        createdAt: acl.createdAt.toString()
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Resource creation failed: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * GET /auth/resources/:resourceId
 * Get resource information
 */
router.get('/resources/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const acl = wstfAuth.getACL(resourceId);

    if (!acl) {
      return res.status(404).json({
        ok: false,
        error: 'Resource not found'
      });
    }

    // Return public information
    res.json({
      ok: true,
      resource: {
        resourceId: acl.resourceId,
        name: acl.name,
        description: acl.description,
        owner: acl.owner,
        defaultLevel: acl.defaultLevel,
        allowSelfRegistration: acl.allowSelfRegistration,
        createdAt: acl.createdAt.toString(),
        totalEntries: acl.entries.length
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get resource: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * GET /auth/resources/:resourceId/acl
 * Get access control list (admin only)
 */
router.get('/resources/:resourceId/acl', requireAuth(':resourceId', { level: 'admin' }), async (req, res) => {
  try {
    const acl = req.wstfAuth!.acl;

    res.json({
      ok: true,
      acl: {
        resourceId: acl.resourceId,
        name: acl.name,
        description: acl.description,
        owner: acl.owner,
        defaultLevel: acl.defaultLevel,
        allowSelfRegistration: acl.allowSelfRegistration,
        entries: acl.entries.map(entry => ({
          publicKey: entry.publicKey,
          label: entry.label,
          level: entry.level,
          scopes: entry.scopes,
          expiresAt: entry.expiresAt?.toString(),
          grantedBy: entry.grantedBy,
          grantedAt: entry.grantedAt.toString(),
          metadata: entry.metadata
        })),
        createdAt: acl.createdAt.toString(),
        updatedAt: acl.updatedAt.toString()
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get ACL: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * POST /auth/resources/:resourceId/grant-access
 * Grant access to a user (admin only)
 */
router.post('/resources/:resourceId/grant-access', requireAuth(':resourceId', { level: 'admin' }), async (req, res) => {
  try {
    const { resourceId } = req.params;
    const {
      userPublicKey,
      label,
      level,
      scopes,
      expiresAt,
      metadata
    } = req.body;

    if (!userPublicKey) {
      return res.status(400).json({
        ok: false,
        error: 'Missing userPublicKey'
      });
    }

    const success = wstfAuth.grantAccess(resourceId, userPublicKey, req.wstfAuth!.userPublicKey, {
      label,
      level,
      scopes,
      expiresAt: expiresAt ? BigInt(expiresAt) : undefined,
      metadata
    });

    if (!success) {
      return res.status(400).json({
        ok: false,
        error: 'Failed to grant access'
      });
    }

    res.json({
      ok: true,
      message: 'Access granted successfully',
      user: {
        publicKey: userPublicKey,
        label: label || `User ${userPublicKey.slice(0, 8)}...`,
        level: level || 'read'
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to grant access: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * POST /auth/resources/:resourceId/revoke-access
 * Revoke access for a user (admin only)
 */
router.post('/resources/:resourceId/revoke-access', requireAuth(':resourceId', { level: 'admin' }), async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { userPublicKey } = req.body;

    if (!userPublicKey) {
      return res.status(400).json({
        ok: false,
        error: 'Missing userPublicKey'
      });
    }

    const success = wstfAuth.revokeAccess(resourceId, userPublicKey, req.wstfAuth!.userPublicKey);

    if (!success) {
      return res.status(400).json({
        ok: false,
        error: 'User does not have access or cannot be revoked'
      });
    }

    res.json({
      ok: true,
      message: 'Access revoked successfully',
      user: {
        publicKey: userPublicKey
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to revoke access: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * GET /auth/my-resources
 * Get resources owned by authenticated user
 */
router.get('/my-resources', optionalAuth('*'), async (req, res) => {
  try {
    if (!req.wstfAuth) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required'
      });
    }

    const ownedResources = wstfAuth.getOwnedResources(req.wstfAuth.userPublicKey);

    res.json({
      ok: true,
      resources: ownedResources.map(acl => ({
        resourceId: acl.resourceId,
        name: acl.name,
        description: acl.description,
        defaultLevel: acl.defaultLevel,
        allowSelfRegistration: acl.allowSelfRegistration,
        totalEntries: acl.entries.length,
        createdAt: acl.createdAt.toString()
      }))
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get owned resources: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * GET /auth/my-access
 * Get resources user has access to
 */
router.get('/my-access', optionalAuth('*'), async (req, res) => {
  try {
    if (!req.wstfAuth) {
      return res.status(401).json({
        ok: false,
        error: 'Authentication required'
      });
    }

    const accessibleResources = wstfAuth.getAccessibleResources(req.wstfAuth.userPublicKey);

    res.json({
      ok: true,
      resources: accessibleResources.map(({ acl, entry }) => ({
        resourceId: acl.resourceId,
        name: acl.name,
        description: acl.description,
        owner: acl.owner,
        access: {
          level: entry.level,
          scopes: entry.scopes,
          expiresAt: entry.expiresAt?.toString(),
          grantedAt: entry.grantedAt.toString()
        }
      }))
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to get accessible resources: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * POST /auth/resources/:resourceId/gated-url
 * Generate a gated URL with embedded authentication
 */
router.post('/resources/:resourceId/gated-url', requireAuth(':resourceId'), async (req, res) => {
  try {
    const { baseURL } = req.body;

    if (!baseURL) {
      return res.status(400).json({
        ok: false,
        error: 'Missing baseURL'
      });
    }

    const gatedURL = wstfAuth.createGatedURL(baseURL, req.params.resourceId, req.wstfAuth!.token);

    res.json({
      ok: true,
      gatedURL,
      expiresAt: req.wstfAuth!.token.exp
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: `Failed to generate gated URL: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

/**
 * GET /auth/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'WSTFAuth',
    timestamp: Date.now()
  });
});

export default router;