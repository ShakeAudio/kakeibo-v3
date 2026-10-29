import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで公開されるため相対パスにしておく
  base: './',
  build: {
    // iCloud Drive に同期させないため .nosync で終わるフォルダに出力する
    outDir: 'dist.nosync',
    emptyOutDir: true,
  },
});
