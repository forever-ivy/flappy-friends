import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { umamiHtmlPlugin } from './umami-html-plugin.mjs'
import { googleVerificationHtmlPlugin } from './google-verification-html-plugin.mjs'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        umamiHtmlPlugin(),
        googleVerificationHtmlPlugin(),
    ],
    server: {
        port: 8080
    }
})
