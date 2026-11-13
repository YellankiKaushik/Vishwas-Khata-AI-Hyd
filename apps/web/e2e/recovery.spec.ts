import { test, expect } from "./offline-test";

test("lost confirmation response survives reload and original-key retry with external network blocked", async ({
  page,
}) => {
  const egress: string[] = [];
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "127.0.0.1") {
      egress.push(u.hostname);
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByRole("button", { name: "Add synthetic customer" }).click();
  const name = "Recovery demo " + Date.now();
  await page.getByLabel("Synthetic customer label").fill(name);
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/v1/customers") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Add customer", exact: true }).click(),
  ]);
  const cid = (await created.json()).id;
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption(cid);
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("₹500", { exact: true }),
  ).toBeVisible();
  let originalId = "";
  let originalKey = "";
  await page.route(
    "**/v1/ledger/drafts/*/confirm",
    async (route) => {
      originalKey = route.request().headers()["idempotency-key"];
      const committed = await route.fetch();
      expect(committed.status()).toBe(201);
      originalId = (await committed.json()).entry_id;
      await route.abort("connectionfailed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Confirm and post", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original confirmation" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original confirmation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit details" }),
  ).toBeDisabled();
  const [replayed] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/confirm")),
    page.getByRole("button", { name: "Retry original confirmation" }).click(),
  ]);
  expect(replayed.status()).toBe(200);
  expect((await replayed.json()).entry_id).toBe(originalId);
  expect(replayed.request().headers()["idempotency-key"]).toBe(originalKey);
  await page.getByRole("button", { name: "Your journal", exact: true }).click();
  await expect(
    page.locator(".journal-row").filter({ hasText: name }),
  ).toHaveCount(1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("vishwas-synthetic-journal.csv");
  expect(egress).toEqual([]);
});
