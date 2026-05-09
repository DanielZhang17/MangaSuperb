import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'https://mangasuperb.anranz.xyz'

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: apiProxyTarget.startsWith('https://'),
          rewrite: (p: string) => p,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore forwarded to http-proxy
          cookieDomainRewrite: '',
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore forwarded to http-proxy
          cookiePathRewrite: '/',
          configure: (proxy: any) => {
            proxy.on('proxyRes', (proxyRes: any) => {
              const setCookieHeader = proxyRes.headers['set-cookie']
              if (Array.isArray(setCookieHeader)) {
                proxyRes.headers['set-cookie'] = setCookieHeader.map((c: string) =>
                  c
                    .replace(/;\s*Domain=[^;]+/i, '')
                    .replace(/;\s*Secure/gi, ''),
                )
              }
            })
          },
        },
        // Proxy static avatar images to storage with referer header to bypass hotlink protection in dev
        '/static': {
          target: 'https://storage.mangasuperb.anranz.xyz',
          changeOrigin: true,
          secure: true,
          // keep '/static' path so '/static/avatar...' -> 'https://storage.../static/avatar...'
          rewrite: (p: string) => p,
          configure: (proxy: any) => {
            proxy.on('proxyReq', (proxyReq: any) => {
              proxyReq.setHeader('Referer', 'https://storage.mangasuperb.anranz.xyz/')
              proxyReq.setHeader('Origin', 'https://storage.mangasuperb.anranz.xyz')
            })
          },
        },
        // Also proxy '/manga' path which exists on storage for generated assets
        '/manga': {
          target: 'https://storage.mangasuperb.anranz.xyz',
          changeOrigin: true,
          secure: true,
          rewrite: (p: string) => p,
          configure: (proxy: any) => {
            proxy.on('proxyReq', (proxyReq: any) => {
              proxyReq.setHeader('Referer', 'https://storage.mangasuperb.anranz.xyz/')
              proxyReq.setHeader('Origin', 'https://storage.mangasuperb.anranz.xyz')
            })
          },
        },
      },
    },
  }
})
