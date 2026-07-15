import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",

  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
