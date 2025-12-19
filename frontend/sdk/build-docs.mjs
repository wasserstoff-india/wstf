#!/usr/bin/env node
/**
 * WSTF Kit Docs Build Script
 *
 * Builds the documentation SPA for production deployment.
 * Output: dist/docs-site/
 */

import { build } from 'esbuild';
import { existsSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const tailwindcss = require('@tailwindcss/postcss');
const autoprefixer = require('autoprefixer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist/docs-site');
const publicDir = join(__dirname, 'public');

// Clean dist directory
if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true });
}
mkdirSync(distDir, { recursive: true });

console.log('Building WSTF Kit Docs...\n');

// Build options
const buildOptions = {
    entryPoints: [join(__dirname, 'docs/main.tsx')],
    bundle: true,
    outdir: distDir,
    format: 'esm',
    platform: 'browser',
    target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
    sourcemap: false,
    minify: true,
    jsx: 'automatic',
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
    },
    define: {
        'process.env.NODE_ENV': '"production"',
    },
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
};

async function buildDocs() {
    try {
        // 1. Bundle JS/CSS
        await build(buildOptions);
        console.log('✅ Bundled Assets');

        // 2. Copy index.html
        const indexSrc = join(__dirname, 'docs/index.html');
        const indexDst = join(distDir, 'index.html');
        copyFileSync(indexSrc, indexDst);
        console.log('✅ Copied index.html');

        // 3. Create .nojekyll to bypass Jekyll processing on GitHub Pages
        writeFileSync(join(distDir, '.nojekyll'), '');
        console.log('✅ Created .nojekyll');


        // 4. Build Tailwind CSS
        console.log('Building Tailwind CSS...');
        try {
            const cssInput = readFileSync('./docs/input.css', 'utf-8');
            const result = await postcss([
                tailwindcss({ config: './tailwind.config.js' }),
                autoprefixer
            ]).process(cssInput, {
                from: './docs/input.css',
                to: './dist/docs-site/style.css'
            });

            writeFileSync('./dist/docs-site/style.css', result.css);
            console.log('✅ Built style.css');

            // 5. Update index.html to use local CSS instead of CDN
            let htmlContent = readFileSync(indexDst, 'utf-8');

            // Remove CDN script and config
            htmlContent = htmlContent.replace(/<script src="https:\/\/cdn.tailwindcss.com"><\/script>[\s\S]*?<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/, '');

            // Add local stylesheet
            htmlContent = htmlContent.replace('</head>', '<link href="./style.css" rel="stylesheet">\n  </head>');

            writeFileSync(indexDst, htmlContent);
            console.log('✅ Updated index.html with local CSS');

        } catch (e) {
            console.warn('⚠️ Tailwind build failed (is npx installed?):', e.message);
            console.warn('Falling back to CDN in index.html will be required.');
        }

        console.log('\nBuild complete! Output: dist/docs-site/');

    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

buildDocs();
