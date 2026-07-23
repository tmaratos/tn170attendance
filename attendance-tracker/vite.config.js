import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/** Commit SHA (short) + build date, embedded so the kiosk can show which build it runs. */
function appVersion() {
  const envSha = process.env.VITE_COMMIT_SHA || process.env.GITHUB_SHA;
  let sha = envSha ? String(envSha).slice(0, 7) : null;
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      sha = 'local';
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  return `${sha} (${date})`;
}

export default defineConfig({
  base: '/tn170attendance/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
});
