import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 6464,
    proxy: {
      '/api': {
        target: 'http://backend:3001',
        changeOrigin: true,
        secure: false,
      },
      '/files': {
        target: 'http://backend:3001',
        changeOrigin: true,
        secure: false,
      }
    },
    // Configure MIME types for .mjs files
    middlewareMode: false,
    fs: {
      allow: ['..']
    }
  },
  plugins: [
    react(),
    {
      name: 'configure-mjs-mime-type',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'text/javascript');
          }
          next();
        });
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['pg', 'pg-pool', 'pg-native'],
    include: ['react-pdf']
  },
  define: {
    global: 'globalThis',
  },
  worker: {
    format: 'es'
  },
  build: {
    rollupOptions: {
      external: ['pg', 'pg-pool', 'pg-native']
    }
  }
}));
