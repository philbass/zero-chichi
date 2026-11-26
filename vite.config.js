import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      // Deux applis : Zéro Chichi (index.html) et Zéro Chichi Admin (admin/index.html → /admin/).
      input: { main: 'index.html', admin: 'admin/index.html' },
    },
  },
});
