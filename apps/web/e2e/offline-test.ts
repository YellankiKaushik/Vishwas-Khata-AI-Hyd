import { test as base, expect } from "@playwright/test";

// Every compiled journey runs with nonloopback browser traffic blocked.
export const test = base.extend({
  context: async ({ context }, use) => {
    const external: string[] = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        external.push(url.hostname);
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    await use(context);
    expect(external, "Application must stay on loopback during offline QA").toEqual([]);
  },
});
export { expect };
