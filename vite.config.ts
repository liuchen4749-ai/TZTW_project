import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 👈 必须匹配你的仓库名：TZTW_project
  base: '/TZTW_project/', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});
