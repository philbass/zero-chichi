// Build de « Zéro Chichi Admin », servi par le relais Cloudflare (worker-admin/) à sa propre adresse,
// pour qu'il s'installe comme une app séparée de Zéro Chichi.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'admin',
  base: './',
  publicDir: 'public',
  plugins: [react()],
  build: { outDir: '../dist-admin', emptyOutDir: true },
});
