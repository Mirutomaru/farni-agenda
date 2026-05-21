// FARNÍ AGENDA - PLAYWRIGHT KONFIGURACE
// End-to-end testování

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/frontend/e2e',
  
  // Spustit všechny testy paralelně
  fullyParallel: true,
  
  // Počet paralelních instancí
  workers: process.env.CI ? 1 : undefined,
  
  // Chybové hlášky
  reporter: 'html',
  timeout: 30 * 1000, // 30 sekund na test
  
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:3000',
    
    // Screenshot při chybě
    screenshot: 'only-on-failure',
    
    // Video při chybě
    video: 'retain-on-failure',
    
    // Trace pro debugování
    trace: 'retain-on-failure',
    
    // User agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    
    // Launch options
    launchOptions: {
      slowMo: 100, // Pomalejší akce pro lepší vizualizaci
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobilní testování
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // CI/CD nastavení
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
