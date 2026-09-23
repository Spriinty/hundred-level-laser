import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));

export default defineConfig(({ mode }) => {
  // GitHub Pages serves the game from a path we know in advance. itch.io
  // serves it from one it picks per upload, so the script and style tags Vite
  // writes into index.html have to be relative or every one of them 404s.
  //
  // The runtime asset paths ('assets/…', 'music/…') are already relative and
  // resolve against the page, so they need nothing either way.
  const itch = mode === 'itch';

  return {
    base: itch ? './' : '/hundred-level-laser/',
    // Lets the game display which build is running.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      outDir: itch ? 'dist-itch' : 'dist',
    },
  };
});
