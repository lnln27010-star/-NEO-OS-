import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {deliveryPlugin} from './scripts/deliveryPlugin.mjs'

const buildId=`platform-7.0-${Date.now()}`
const simulationProxy={
  '/api/simulation':{target:'http://127.0.0.1:8001',changeOrigin:false},
  '/api/platform':{target:'http://127.0.0.1:8001',changeOrigin:false},
}
export default defineConfig({
  define:{__APP_BUILD__:JSON.stringify(buildId)},
  plugins: [react(),deliveryPlugin(buildId)],
  // Open sessions may still request a previous build's lazy scene chunks.
  build: { emptyOutDir: false },
  server: {
    proxy:simulationProxy,
    port: 4186,
    host:'127.0.0.1',
    strictPort:true,
  },
  preview:{host:'127.0.0.1',port:4187,strictPort:true,proxy:simulationProxy},
})
