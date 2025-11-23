#!/usr/bin/env node
/**
 * SDK Build Script
 *
 * Builds the SDK for npm publishing using esbuild.
 * This bundles all dependencies (including internal chain modules) into a standalone package.
 *
 * Usage:
 *   node build.mjs         # Build for production
 *   node build.mjs --watch # Watch mode for development
 */

import { build, context } from 'esbuild';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
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

console.log('🔨 Building @wasserstoff/wstf-sdk...\n');

// Common build options
const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  external: [
    // Node built-ins
    'crypto',
    'buffer',
    'fs',
    'path',
    'util',
    // Peer dependencies
    'bs58check',
  ],
};

async function buildSDK() {
  try {
    if (isWatch) {
      // Watch mode using context API
      const ctx = await context({
        ...commonOptions,
        entryPoints: [join(__dirname, 'index.ts')],
        outfile: join(distDir, 'index.js'),
      });
      await ctx.watch();
      console.log('👀 Watching for changes...');
      return;
    }

    // Build main entry point
    await build({
      ...commonOptions,
      entryPoints: [join(__dirname, 'index.ts')],
      outfile: join(distDir, 'index.js'),
    });

    // Build core subpath export
    await build({
      ...commonOptions,
      entryPoints: [join(__dirname, 'core/index.ts')],
      outfile: join(distDir, 'core/index.js'),
    });

    // Build highlevel subpath export
    await build({
      ...commonOptions,
      entryPoints: [join(__dirname, 'highlevel/index.ts')],
      outfile: join(distDir, 'highlevel/index.js'),
    });

    console.log('✅ JavaScript bundles created\n');

    // Generate TypeScript declarations
    console.log('📝 Generating TypeScript declarations...');

    try {
      // Build from root to generate declarations with all dependencies
      execSync('npx tsc --project tsconfig.json --emitDeclarationOnly --declaration --declarationMap --outDir dist', {
        cwd: join(__dirname, '../..'),
        stdio: 'pipe',
      });

      // Copy SDK declarations to SDK dist folder
      const rootDistSdk = join(__dirname, '../../dist/sdk');
      if (existsSync(rootDistSdk)) {
        execSync(`cp -r "${rootDistSdk}"/* "${distDir}/"`, { stdio: 'pipe' });
        console.log('✅ TypeScript declarations generated\n');
      } else {
        console.warn('⚠️  Declaration output not found at expected location');
      }
    } catch (e) {
      // Declarations are optional - JS bundle is the main artifact
      console.warn('⚠️  TypeScript declaration generation had issues (declarations optional)');
      console.log('   The JS bundle is still usable without .d.ts files\n');
    }

    // Clean up test files from dist
    try {
      execSync(`rm -f "${distDir}"/*.test.* "${distDir}"/**/*.test.*`, { stdio: 'pipe' });
    } catch (e) {
      // Ignore - files might not exist
    }

    console.log('✅ Build complete!\n');

    console.log('📊 Build Summary:');
    console.log('   Output: ./dist/');
    console.log('   Entry:  ./dist/index.js');
    console.log('   Types:  ./dist/index.d.ts');
    console.log('\n🚀 Ready to publish with: npm publish');

  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildSDK();
