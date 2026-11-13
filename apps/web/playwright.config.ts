import { defineConfig } from "@playwright/test";
import path from "node:path";
const python = process.env.VISHWAS_TEST_PYTHON || path.resolve("../../.venv/Scripts/python.exe");
const db = path.resolve("../../.tmp/e2e-" + Date.now() + ".sqlite3");
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 40000,
  webServer: [
    {
      command: `"${python}" "${path.resolve("../../scripts/e2e_server.py")}"`,
      url: "http://127.0.0.1:8001/v1/health/ready",
      env: {
        DATABASE_PATH: db,
        VISHWAS_AS_OF: "2026-10-27T17:00:00Z",
        VOICE_PROVIDER: "mock",
        DEMO_MODE: "true",
      },
      reuseExistingServer: false,
    },

  ],
  use: {
    baseURL: "http://127.0.0.1:8001",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    launchOptions: { chromiumSandbox: true },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  outputDir: "../../test-results/browser",
});
