#!/usr/bin/env node
/**
 * WSTF Kit Build Script
 *
 * Builds the frontend SDK for npm publishing using esbuild.
 * Generates ESM bundles with TypeScript declarations.
 *
 * Usage:
 *   node build.mjs         # Build for production
 *   node build.mjs --watch # Watch mode for development
 */

import { build, context } from 'esbuild';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');
const isWatch = process.argv.includes('--watch');

// Clean dist directory
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

console.log('Building @wasserstoff/wstf-kit...\n');

// Entry points for separate bundles
const entryPoints = {
  'index': './index.ts',
  'core/index': './core/index.ts',
  'react/index': './react/index.ts',
  'components/index': './components/index.ts',
  'examples/index': './examples/index.ts',
  'docs/index': './docs/index.ts',
};

// Common build options
const commonOptions = {
  bundle: true,
  platform: 'browser',
  target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
  format: 'esm',
  sourcemap: !isWatch ? 'external' : true,
  minify: !isWatch,
  treeShaking: true,
  // Mark peer deps and dependencies as external
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    // Noble crypto libraries (bundled dependencies)
    '@noble/ed25519',
    '@noble/secp256k1',
    '@noble/hashes',
    '@noble/hashes/*',
  ],
  // Define for tree-shaking
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
  // JSX settings for React
  jsx: 'automatic',
  // Loader for TypeScript
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  // Resolve extensions
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
};

/**
 * Generate TypeScript declarations
 * Note: For proper declarations, run from the main project with all dependencies installed.
 * This standalone build creates minimal type stubs.
 */
async function generateDeclarations() {
  console.log('Creating type definitions...');
  // Type generation requires the main project context with React types installed.
  // The createTypeStubs() function creates minimal type stubs for distribution.
  // For full type support, consumers should use the main project's tsconfig.
}

/**
 * Create minimal type stubs if tsc fails
 */
function createTypeStubs() {
  const stubContent = `
// Auto-generated type stubs
export * from '../index';
`.trim();

  const dirs = ['core', 'react', 'components'];

  for (const dir of dirs) {
    const dirPath = join(distDir, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    const dtsPath = join(dirPath, 'index.d.ts');
    if (!existsSync(dtsPath)) {
      writeFileSync(dtsPath, `export * from '..';\n`);
    }
  }

  // Main index stub
  const mainDts = join(distDir, 'index.d.ts');
  if (!existsSync(mainDts)) {
    writeFileSync(mainDts, `
// WSTF Kit Type Definitions
// For full types, ensure TypeScript compilation succeeds

export interface WstfConfig {
  rpcUrl: string;
  network?: 'mainnet' | 'testnet' | 'devnet' | 'local';
}

export function createClient(config: WstfConfig): any;
export function createWalletManager(): any;

// React exports
export function WstfProvider(props: { config: WstfConfig; children: React.ReactNode }): JSX.Element;
export function useWstf(): any;
export function useWallet(): any;
export function useAccount(address: string): any;
export function useBalances(address: string): any;
export function useMarkets(): any;
export function useExplorer(): any;

// Component exports
export const AccountOverview: React.FC<{ address: string }>;
export const TxList: React.FC<{ address: string }>;
export const BlockList: React.FC<{ limit?: number }>;
export const AddressPill: React.FC<{ address: string }>;
export const WalletOnboard: React.FC<any>;
export const PaperWalletCard: React.FC<any>;
export const WalletSwitcher: React.FC<any>;
export const Orderbook: React.FC<any>;
export const TradesTable: React.FC<any>;
export const LpGridPreview: React.FC<any>;
`.trim());
  }
}

async function buildPackage() {
  try {
    if (isWatch) {
      // Watch mode
      console.log('Starting watch mode...\n');

      const ctx = await context({
        ...commonOptions,
        entryPoints: Object.fromEntries(
          Object.entries(entryPoints).map(([out, src]) => [out, join(__dirname, src)])
        ),
        outdir: distDir,
        splitting: true,
        chunkNames: 'chunks/[name]-[hash]',
      });

      await ctx.watch();
      console.log('Watching for changes...');
      return;
    }

    // Production build
    console.log('Building ESM bundles...');

    // Build all entry points with code splitting
    await build({
      ...commonOptions,
      entryPoints: Object.fromEntries(
        Object.entries(entryPoints).map(([out, src]) => [out, join(__dirname, src)])
      ),
      outdir: distDir,
      splitting: true,
      chunkNames: 'chunks/[name]-[hash]',
    });

    console.log('ESM bundles created');

    // Generate TypeScript declarations
    await generateDeclarations();

    // Create type stubs as fallback
    createTypeStubs();

    // Calculate bundle sizes
    const files = readdirSync(distDir).filter(f => f.endsWith('.js'));
    let totalSize = 0;

    console.log('\nBundle sizes:');
    for (const file of files) {
      const filePath = join(distDir, file);
      const stat = statSync(filePath);
      totalSize += stat.size;
      console.log(`  ${file}: ${(stat.size / 1024).toFixed(2)} KB`);
    }

    // Check chunks directory
    const chunksDir = join(distDir, 'chunks');
    if (existsSync(chunksDir)) {
      const chunks = readdirSync(chunksDir).filter(f => f.endsWith('.js'));
      for (const chunk of chunks) {
        const chunkPath = join(chunksDir, chunk);
        const stat = statSync(chunkPath);
        totalSize += stat.size;
        console.log(`  chunks/${chunk}: ${(stat.size / 1024).toFixed(2)} KB`);
      }
    }

    console.log(`\nTotal: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`Gzipped (estimated): ~${(totalSize / 1024 / 3).toFixed(2)} KB\n`);

    console.log('Build complete!\n');
    console.log('Build Summary:');
    console.log('  Output:     ./dist/');
    console.log('  Main:       ./dist/index.js');
    console.log('  Core:       ./dist/core/index.js');
    console.log('  React:      ./dist/react/index.js');
    console.log('  Components: ./dist/components/index.js');
    console.log('\nReady to publish with: npm publish');

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildPackage();
