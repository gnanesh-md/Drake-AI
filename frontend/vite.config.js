import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const JS_BACKEND_URL = 'https://js-curvetracking.thedrake.ai'
const PYTHON_BACKEND_URL = 'https://python-curvetracking.thedrake.ai'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `${JS_BACKEND_URL}/analysis`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/python': {
        target: `${JS_BACKEND_URL}/export_points`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/python/, ''),
      },
      '/process_image_v2': {
        target: `${JS_BACKEND_URL}/process_image_v2`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/process_image_v2/, ''),
      },
      '/upload_tif': {
        target: `${PYTHON_BACKEND_URL}/upload_tif/`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/upload_tif/, ''),
      },
      '/process_image': {
        target: `${JS_BACKEND_URL}/process_image`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/process_image/, ''),
      },
    },
  },
})
