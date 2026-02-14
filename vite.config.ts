
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/ethers') || id.includes('node_modules/bs58')) {
            return 'chain-vendor';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
