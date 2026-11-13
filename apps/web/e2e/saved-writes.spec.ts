import { test, expect } from "./offline-test";

test("observation and reversal retries survive response loss and reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Daily briefing", exact: true })
    .click();
  await page.getByRole("button", { name: "Record sale observation" }).click();
  await page.getByLabel("Recorded amount (₹)").fill("6.50");
  await page
    .getByLabel("Observed time (Asia/Kolkata)")
    .fill("2026-10-27T16:30");
  let observationId = "";
  await page.route(
    "**/v1/observations/sales",
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      observationId = (await response.json()).id;
      await route.abort("connectionfailed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Record synthetic observation", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.reload();
  const [replayedObservation] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/observations/sales")),
    page
      .getByRole("button", { name: "Retry saved observation", exact: true })
      .click(),
  ]);
  expect(replayedObservation.status()).toBe(200);
  expect((await replayedObservation.json()).id).toBe(observationId);
  await expect(
    page.getByText("Synthetic observation recorded once.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption("cus_lakshmi");
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm and post", exact: true })
    .click();
  await expect(
    page.getByText("Recorded, with your confirmation."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Your journal", exact: true }).click();
  await page
    .locator(".journal-row")
    .filter({ hasText: "Lakshmi" })
    .getByRole("button")
    .click();
  await page
    .getByLabel("Reason for correction")
    .fill("Synthetic recovery test");
  let reversalId = "",
    key = "";
  await page.route(
    "**/v1/ledger/entries/*/reverse",
    async (route) => {
      key = route.request().headers()["idempotency-key"];
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      reversalId = (await response.json()).entry_id;
      await route.abort("connectionfailed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", {
      name: "Confirm reversal of Credit given",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.reload();
  const [replayedReversal] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/reverse")),
    page
      .getByRole("button", { name: "Retry saved reversal", exact: true })
      .click(),
  ]);
  expect(replayedReversal.status()).toBe(200);
  expect((await replayedReversal.json()).entry_id).toBe(reversalId);
  expect(replayedReversal.request().headers()["idempotency-key"]).toBe(key);
  await expect(
    page.getByText("Reversal posted once.", { exact: false }),
  ).toBeVisible();
  const balance = await (
    await page.request.get("/v1/customers/cus_lakshmi/balance")
  ).json();
  expect(balance.outstanding_balance_paise).toBe(0);
});
