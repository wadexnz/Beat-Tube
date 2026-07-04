import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/beat-tube/',
  plugins: [
    UnoCSS(),
  ],
})
