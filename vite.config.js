import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // على GitHub Pages يُخدم الموقع تحت /اسم-المستودع/ — يُمرَّر عبر VITE_BASE عند البناء
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173 },
});
