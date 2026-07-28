import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Uma única instância de React no bundle. Sem isso, uma dependência que
    // traga sua própria cópia quebra os hooks ("Invalid hook call").
    dedupe: ['react', 'react-dom'],
  },
})
