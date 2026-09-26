import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// En desarrollo, /api, /uploads y /socket.io se redirigen al backend Node.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:4000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': target,
        '/uploads': target,
        '/socket.io': { target, ws: true }
      }
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('leaflet')) return 'mapas';
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'graficos';
          }
        }
      }
    }
  };
});
