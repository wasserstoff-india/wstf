/**
 * WSTF Chain Version Information
 *
 * Version is kept in sync with package.json and SDK version.
 * All packages in the monorepo should use the same version.
 */

// Version - keep in sync with package.json and SDK
export const VERSION = '0.1.0';

// Package names
export const PACKAGES = {
  chain: 'wstfchain',
  sdk: '@wasserstoff/wstf-sdk',
  cli: '@wasserstoff/wstf-cli',
} as const;

// Build metadata
export const BUILD_INFO = {
  version: VERSION,
  name: PACKAGES.chain,
  sdkName: PACKAGES.sdk,
  cliName: PACKAGES.cli,
  description: 'WSTF Chain - Deterministic instruction-based blockchain',
  homepage: 'https://github.com/wasserstoff-india/wstf',
  repository: 'https://github.com/wasserstoff-india/wstf.git',
  bugs: 'https://github.com/wasserstoff-india/wstf/issues',
  license: 'MIT',
  author: 'Wasserstoff Team',
  engines: {
    node: '>=18.0.0',
  },
};

/**
 * Get full version string with build info
 */
export function getVersionString(): string {
  return `WSTF Chain v${VERSION}`;
}

/**
 * Get version object for API responses
 */
export function getVersionInfo(): {
  version: string;
  name: string;
  node: string;
  platform: string;
  arch: string;
} {
  return {
    version: VERSION,
    name: BUILD_INFO.name,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * Get full build info for diagnostics
 */
export function getFullBuildInfo(): typeof BUILD_INFO & {
  runtime: {
    node: string;
    platform: string;
    arch: string;
    pid: number;
    uptime: number;
  };
} {
  return {
    ...BUILD_INFO,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
    },
  };
}
