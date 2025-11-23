#!/usr/bin/env node
/**
 * CLI Build Script
 *
 * Builds the WSTF CLI for npm publishing using esbuild.
 * This bundles all dependencies into a standalone executable.
 *
 * Usage:
 *   node build.mjs         # Build for production
 *   node build.mjs --watch # Watch mode for development
 */

import { build, context } from 'esbuild';
import { existsSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');
const isWatch = process.argv.includes('--watch');

// Clean dist directory
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

console.log('Building @wasserstoff/wstf-cli...\n');

// Common build options - use CJS format for better CLI compatibility
const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs', // CommonJS for better CLI support
  sourcemap: false, // No sourcemap for CLI distribution
  minify: !isWatch,
  external: [
    // Node built-ins
    'crypto',
    'buffer',
    'fs',
    'path',
    'util',
    'net',
    'http',
    'https',
    'stream',
    'events',
    'os',
    'child_process',
    // External dependencies
    'bs58check',
    'cbor',
    'fastify',
  ],
  banner: {
    js: '#!/usr/bin/env node',
  },
};

async function buildCLI() {
  try {
    if (isWatch) {
      // Watch mode using context API
      const ctx = await context({
        ...commonOptions,
        entryPoints: [join(__dirname, '../runner/cli.ts')],
        outfile: join(distDir, 'cli.js'),
      });
      await ctx.watch();
      console.log('Watching for changes...');
      return;
    }

    // Build CLI entry point
    await build({
      ...commonOptions,
      entryPoints: [join(__dirname, '../runner/cli.ts')],
      outfile: join(distDir, 'cli.js'),
    });

    // Make executable
    chmodSync(join(distDir, 'cli.js'), '755');

    console.log('JavaScript bundle created\n');
    console.log('Build complete!\n');

    console.log('Build Summary:');
    console.log('   Output: ./dist/');
    console.log('   Entry:  ./dist/cli.js');
    console.log('\nReady to publish with: npm publish');

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildCLI();
