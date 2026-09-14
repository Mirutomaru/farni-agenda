// FARNÍ AGENDA - KONFIGURACE PRO TESTOVÁNÍ
// Jest a Playwright konfigurace

module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.test.json",
        jsx: "react-jsx",
      },
    ],
  },
  moduleNameMapper: {
    // @/features/X → components/features/X (prioritně)
    "^@/features/(.*)$": "<rootDir>/components/features/$1",
    
    // @/lib/X → lib/X (pro Supabase client atd.)
    "^@/lib/(.*)$": "<rootDir>/lib/$1",
    
    // Zbylé @/X → root projektu
    "^@/(.*)$": "<rootDir>/$1",
    
    // CSS mock
    "\\.css$": "<rootDir>/tests/__mocks__/styleMock.ts",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/tests/**/*.test.(ts|tsx)"],
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "!app/api/**",
    "!app/**/route.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 30000,
};
