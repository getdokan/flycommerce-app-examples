import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/pages',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../../dist/pages', emptyOutDir: true },
});
