import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// workspace 包 @skillkit/types 是纯 TS(无构建产物),直接 alias 到源码,
// 让三个 bundle(main / preload / renderer)都走源码而非 node_modules 预构建。
const typesSrc = path.resolve(__dirname, '../../packages/types/src');

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      // shadcn 组件约定用 @/ 导入（@/lib/utils、@/components/ui/*）
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@skillkit/types': typesSrc,
    },
  },
  plugins: [
    react(),
    // Tailwind v4：只处理 renderer bundle 的 CSS；main/preload 无 CSS，不受影响。
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'electron', 'tar', 'adm-zip', '@vercel/blob'],
            },
          },
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
              '@skillkit/types': typesSrc,
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
          resolve: {
            alias: {
              '@skillkit/types': typesSrc,
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: 'dist',
  },
});
