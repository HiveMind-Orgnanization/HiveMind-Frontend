import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

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

  return {
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
