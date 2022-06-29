// vite.config.ts
import Unocss from 'unocss/vite'
import { defineConfig } from 'vite'
import { presetAttributify, presetUno } from 'unocss'

export default defineConfig({
  plugins: [
    Unocss({
      presets: [
        presetAttributify({ /* preset options */}),
        presetUno(),
      ],
    }),
  ],
})
