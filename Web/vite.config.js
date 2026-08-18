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
  build: {
    rolldownOptions: {
      output: {
        // Firebase concentra boa parte do peso da aplicação. Mantê-lo separado
        // evita que uma pequena alteração visual invalide o cache de toda a
        // biblioteca e deixa o pacote principal bem menor.
        codeSplitting: {
          groups: [
            {
              name: 'firebase',
              test: /node_modules[\\/](?:@firebase|firebase)[\\/]/,
              priority: 2,
            },
            {
              name: 'react',
              test: /node_modules[\\/](?:react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
})
