import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // 👈 核心修改：为了让 GitHub Pages 准确找到你的文件，这里必须填仓库名
  // 注意：前后都要有斜杠
  base: '/TZTW_project/', 
  
  resolve: {
    alias: {
      // 这里的配置是为了配合你拆分后的文件结构（components, utils 等）
      // 让你在代码里可以用 @ 符号快速引用根目录
      '@': path.resolve(__dirname, './'),
    },
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 开启 sourcemap 可以帮助你以后在浏览器控制台更清楚地看到报错位置
    sourcemap: true,
  }
});
