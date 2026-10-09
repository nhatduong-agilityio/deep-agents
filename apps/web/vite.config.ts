import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load all vars (empty prefix) so AUTH_TOKEN is readable here but never baked into the bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const authToken = env['AUTH_TOKEN'] ?? '';
  const apiTarget = env['API_TARGET'] ?? 'http://localhost:2024';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          rewrite: (path) => path.replace(/^\/api/, ''),
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (authToken) proxyReq.setHeader('Authorization', `Bearer ${authToken}`);
            });
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      exclude: ['e2e/**', 'node_modules/**'],
    },
  };
});
