import { test, expect } from "./offline-test";

test("reviewed credit → repayment → refresh → stable retry", async ({
  page,
}) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("total-outstanding")).toBeVisible();
  // Repeated executions use a new synthetic alias; money checks remain exact and isolated per customer.
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByRole("button", { name: "Add synthetic customer" }).click();
  const name = "Browser demo " + Date.now();
  await page.getByLabel("Synthetic customer label").fill(name);
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/v1/customers") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Add customer", exact: true }).click(),
  ]);
  const customerId = (await created.json()).id;
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption(customerId);
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("₹500", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm and post", exact: true })
    .click();
  await expect(
    page.getByText("Recorded, with your confirmation."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption(customerId);
  await page.getByLabel("Transaction type").selectOption("REPAYMENT_RECEIVED");
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("₹200", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm and post", exact: true })
    .click();
  await expect(
    page.locator(".receipt-toast").getByText("₹300 outstanding in this receipt", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  const card = page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card.getByText("₹300", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Your journal", exact: true }).click();
  await page.getByRole("button", { name: "Verify last retry" }).click();
  await expect(
    page.getByText("Replay verified:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator(".journal-row").filter({ hasText: name }),
  ).toHaveCount(2);
  expect(crashes).toEqual([]);
});
