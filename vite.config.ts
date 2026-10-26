import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` sirve con un certificado autofirmado y expone la red local: WebXR (Meta Quest) exige HTTPS.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'https' ? [react(), basicSsl()] : [react()],
  server: mode === 'https' ? { host: true } : undefined,
  build: { chunkSizeWarningLimit: 6000 },
}));
