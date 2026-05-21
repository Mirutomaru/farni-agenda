// FARNÍ AGENDA - KONFIGURACE PRO TESTOVÁNÍ
// Jest a Playwright konfigurace

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { 
      tsconfig: './tsconfig.test.json',
      jsx: 'react-jsx'
    }]
  },
  globals: {
    jest: true
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.ts'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  setupFiles: ['<rootDir>/tests/polyfills.ts'],
  testMatch: [
    '**/tests/**/*.test.(ts|tsx)'
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    '!app/api/**',
    '!app/**/route.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 30000,
};
