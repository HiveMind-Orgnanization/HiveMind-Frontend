import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/**
 * Resolve the git commit SHA + branch the build was made from. Used to stamp
 * the bundle so the deployed page can show "loaded build a1b2c3d (dev)" — the
 * fastest way to tell if a user is hitting a stale Vercel preview that hasn't
 * picked up the latest push.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA / VERCEL_GIT_COMMIT_REF when building, so
 * we read those first; falls back to local git CLI for local dev builds.
 */
function getBuildMeta(): { sha: string; branch: string; time: string } {
  const env = process.env
  let sha = env.VERCEL_GIT_COMMIT_SHA ?? ''
  let branch = env.VERCEL_GIT_COMMIT_REF ?? ''
  if (!sha) {
    try { sha = execSync('git rev-parse --short=8 HEAD').toString().trim() } catch { sha = 'unknown' }
  } else {
    sha = sha.slice(0, 8)
  }
  if (!branch) {
    try { branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim() } catch { branch = 'unknown' }
  }
  return { sha, branch, time: new Date().toISOString() }
}

// Serve Docusaurus static build at /docs/* without SPA fallback intercepting
function docsStaticPlugin() {
  return {
    name: 'docs-static',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = req.url ?? ''
        if (!url.startsWith('/docs')) return next()
        // Strip query string for file lookup
        const urlPath = url.split('?')[0]
        // Resolve to a file in public/docs/
        let filePath = path.resolve(__dirname, 'public', urlPath.slice(1))
        // If it's a directory, serve index.html
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html')
        }
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath)
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.ico': 'image/x-icon',
            '.xml': 'application/xml',
            '.txt': 'text/plain',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
          }
          res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        } else {
          next()
        }
      })
    },
  }
}

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.BACKEND_PROXY_TARGET || 'http://127.0.0.1:8787'
  const buildMeta = getBuildMeta()

  return {
    define: {
      __HM_BUILD_SHA__: JSON.stringify(buildMeta.sha),
      __HM_BUILD_BRANCH__: JSON.stringify(buildMeta.branch),
      __HM_BUILD_TIME__: JSON.stringify(buildMeta.time),
    },
    plugins: [
      nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
      docsStaticPlugin(),
      figmaAssetResolver(),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        buffer: path.resolve(__dirname, './node_modules/buffer'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
    build: {
      minify: "esbuild",
      sourcemap: false,
    },
    server: {
      proxy: {
        '/api': { target: backendTarget, changeOrigin: true },
        '/health': { target: backendTarget, changeOrigin: true },
        '/ws': { target: backendTarget, ws: true },
        /** Hosted previews are served by hivemind-backend; proxy so /preview/* works on :5173 (iframe + no SPA 404). */
        '/preview': { target: backendTarget, changeOrigin: true },
      },
    },
  }
})
