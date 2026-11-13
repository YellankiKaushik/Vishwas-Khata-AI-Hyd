import { test, expect } from "./offline-test";
test("four sections use fixture evidence and observation corrections regenerate facts", async ({
  page,
}) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Daily briefing", exact: true })
    .click();
  await page.getByLabel("Briefing business date").fill("2026-10-27");
  await expect(page.locator(".briefing-slot")).toHaveCount(4);
  await expect(
    page.getByText("Priya: no visit recorded in 12 days", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("INSUFFICIENT_DATA:", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record sale observation" }).click();
  await page.getByLabel("Recorded amount (₹)").fill("25.50");
  await page
    .getByLabel("Observed time (Asia/Kolkata)")
    .fill("2026-10-27T16:30");
  const [recorded] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/v1/observations/sales") &&
        r.request().method() === "POST",
    ),
    page
      .getByRole("button", {
        name: "Record synthetic observation",
        exact: true,
      })
      .click(),
  ]);
  const id = (await recorded.json()).id;
  await expect(
    page.getByText("Recorded sales observations: ₹9,125.50", { exact: false }),
  ).toBeVisible();
  await page.getByText("Inspect supporting facts & sources").click();
  await page
    .getByRole("button", { name: "Void observation " + id, exact: true })
    .click();
  await page.getByLabel("Correction reason").fill("Synthetic test correction");
  await page
    .getByRole("button", { name: "Confirm observation void", exact: true })
    .click();
  await expect(
    page.getByText("Recorded sales observations: ₹9,100;", { exact: false }),
  ).toBeVisible();
  expect(crashes).toEqual([]);
});

test("mobile capture and navigation fit viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("total-outstanding")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Your journal", exact: true }).click();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review draft", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
});
