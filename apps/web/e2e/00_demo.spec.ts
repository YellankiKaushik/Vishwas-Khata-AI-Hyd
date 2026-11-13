import { test, expect } from "./offline-test";
import fs from "node:fs/promises";
import path from "node:path";

test("judge journey produces real running-app evidence", async ({ page }) => {
  const directory = path.resolve("../../docs/evidence");
  await fs.mkdir(directory, { recursive: true });
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByTestId("total-outstanding")).toHaveText("₹0");
  const postedIds: string[] = [];
  for (const [sentence, amount] of [
    ["Ramesh took 500 rupees credit", "₹500"],
    ["Ramesh returned 200 rupees", "₹200"],
  ]) {
    await page
      .getByRole("button", { name: "Record transaction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Type / speak a sentence", exact: true })
      .click();
    await page
      .getByLabel("Customer (select the exact ID)")
      .selectOption("cus_ramesh");
    await page.getByLabel("Sentence or corrected transcript").fill(sentence);
    await page
      .getByRole("button", { name: "Review draft", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByText(amount, { exact: true }),
    ).toBeVisible();
    if (amount === "₹500")
      await page.screenshot({
        path: path.join(directory, "02-confirmation-review.png"),
        fullPage: true,
        animations: "disabled",
      });
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith("/confirm") && r.request().method() === "POST",
      ),
      page
        .getByRole("button", { name: "Confirm and post", exact: true })
        .click(),
    ]);
    expect(response.status()).toBe(201);
    postedIds.push((await response.json()).entry_id);
    await expect(
      page.getByText("Recorded, with your confirmation."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dismiss receipt" }).click();
  }
  await expect(page.getByTestId("total-outstanding")).toHaveText("₹300");
  await expect(
    page.getByText("No visit recorded in 12 days.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(directory, "01-overview-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Your journal", exact: true }).click();
  await page.getByRole("button", { name: "Verify last retry" }).click();
  await expect(
    page.getByText("Replay verified:", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".journal-row")).toHaveCount(2);
  await page.screenshot({
    path: path.join(directory, "03-signed-journal.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Daily briefing", exact: true })
    .click();
  await expect(page.locator(".briefing-slot")).toHaveCount(4);
  await page.screenshot({
    path: path.join(directory, "04-four-part-briefing.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByText("Inspect supporting facts & sources").click();
  await page.screenshot({
    path: path.join(directory, "05-source-evidence.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside")).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(directory, "06-overview-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.screenshot({
    path: path.join(directory, "06b-overview-mobile-viewport.png"),
    fullPage: false,
    animations: "disabled",
  });
  const balance = await (
    await page.request.get("/v1/customers/cus_ramesh/balance")
  ).json();
  expect(balance.outstanding_balance_paise).toBe(30000);
  expect(crashes).toEqual([]);
  await fs.writeFile(
    path.join(directory, "browser-demo.json"),
    JSON.stringify(
      {
        evidence: "REAL_BROWSER_SYNTHETIC_DEMO",
        recorded_at_utc: new Date().toISOString(),
        declared_demo_clock: "2026-10-27T17:00:00Z",
        customer_id: "cus_ramesh",
        posted_entry_ids: postedIds,
        balance,
        console_crashes: crashes,
        screenshots: [
          "01-overview-desktop.png",
          "02-confirmation-review.png",
          "03-signed-journal.png",
          "04-four-part-briefing.png",
          "05-source-evidence.png",
          "06-overview-mobile.png",
          "06b-overview-mobile-viewport.png",
        ],
      },
      null,
      2,
    ),
  );
});
