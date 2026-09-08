import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The dev server proxies `/api` to Flask so the browser only ever talks to
 * its own origin. That removes the failure mode where the UI silently falls
 * into demo mode because it was pointed at the wrong port — on macOS the old
 * default (5000) is AirPlay Receiver, which answers every request with an
 * empty 403.
 *
 * Target resolution, first match wins:
 *   VITE_API_URL   from the shell or frontend/.env (start_dev.sh sets it)
 *   127.0.0.1:5050 the backend's default port
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (env.VITE_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
    // `vite preview` (the built bundle) proxies the same way.
    preview: {
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  }
})
