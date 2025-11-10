import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
globalThis.import = {
  meta: {
    env: {
      VITE_BACKEND_URL: 'http://localhost:3001'
    }
  }
};
