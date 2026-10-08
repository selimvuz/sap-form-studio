// Vite's native JSX transform is enough for this browser-only PoC.
// Avoid realpath traversal of parent directories in restricted Windows workspaces.
export default {
  resolve: { preserveSymlinks: true },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { esbuildOptions: { preserveSymlinks: true } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
};
