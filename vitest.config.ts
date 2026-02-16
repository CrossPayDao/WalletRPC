import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json-summary'],
      include: [
        'features/**/*.ts',
        'features/**/*.tsx',
        'services/**/*.ts',
        'contexts/**/*.tsx',
        'components/**/*.tsx'
      ],
      exclude: [
        'tests/**',
        'e2e/**',
        'dist/**',
        'dist-single/**',
        'node_modules/**'
      ]
    }
  }
});
