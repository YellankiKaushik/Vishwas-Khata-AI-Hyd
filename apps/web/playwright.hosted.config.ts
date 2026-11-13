import { defineConfig } from "@playwright/test";

const baseURL = process.env.VISHWAS_HOSTED_TEST_URL;
if (!baseURL || new URL(baseURL).protocol !== "https:") {
  throw new Error("Set VISHWAS_HOSTED_TEST_URL to the authorized HTTPS preview origin.");
}
export default defineConfig({
  testDir: "e2e-hosted",
  workers: 1,
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: { chromiumSandbox: process.env.RUNNER_ENVIRONMENT !== "github-hosted" },
    trace: "off",
    screenshot: "only-on-failure",
  },
});
