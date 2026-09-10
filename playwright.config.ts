import { defineConfig, devices } from "@playwright/test";

/**
 * No slow lane here: nothing this page does needs a model or a network.
 *
 * The fixtures are Steam-shaped rather than minimal, tabs and all, including the
 * capitalisation the real client is inconsistent about.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4176", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Bind the host explicitly. Vite defaults to "localhost", which resolves to ::1 on
    // some machines, and the 127.0.0.1 health check then waits out its whole timeout
    // against a server that is up and listening somewhere else.
    command: "npm run dev -- --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
