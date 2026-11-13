import { test, expect } from "./offline-test";
import { type Page, type Response } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function record(
  page: Page,
  customer: string,
  type: string,
  amount: string,
  expected: number,
  reviewScreenshot?: string,
) {
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  const capture = page.getByRole("dialog", { name: "Record a transaction" });
  await expect(capture).toBeVisible();
  const picker = capture.getByRole("combobox", {
    name: "Customer",
    exact: true,
  });
  const transactionType = capture.getByRole("combobox", {
    name: "Transaction type",
    exact: true,
  });
  const exactAmount = capture.getByRole("textbox", {
    name: "Exact amount in rupees",
    exact: true,
  });
  await expect(picker).toBeEnabled();
  await expect(picker.locator("option", { hasText: customer })).toHaveAttribute(
    "value",
    customer,
  );
  await expect(transactionType).toBeEnabled();
  await expect(exactAmount).toBeEditable();
  await picker.selectOption(customer);
  await transactionType.selectOption(type);
  await exactAmount.fill(amount);
  await capture
    .getByRole("button", { name: "Review draft", exact: true })
    .click();
  const review = page.getByRole("dialog", { name: "Review your entry" });
  await expect(review).toBeVisible();
  if (reviewScreenshot) await page.screenshot({ path: reviewScreenshot });
  const [confirmation] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/confirm") &&
        response.request().method() === "POST",
    ),
    review
      .getByRole("button", { name: "Confirm and post", exact: true })
      .click(),
  ]);
  expect(confirmation.status()).toBe(201);
  expect((await confirmation.json()).outstanding_balance_paise).toBe(expected);
  await expect(review).toBeHidden();
  await page.getByRole("button", { name: "Dismiss receipt" }).click();
}

test("Hyderabad due review and stale unsent draft use the real signed journal", async ({
  page,
}, testInfo) => {
  const customerName = "Ramesh Hyderabad " + randomUUID().slice(0, 8);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/^Failed to load resource:.*\b(?:401|409)\b/.test(message.text())
    ) {
      consoleErrors.push(message.text());
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByRole("button", { name: "Add synthetic customer" }).click();
  await page.getByLabel("Synthetic customer label").fill(customerName);
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/v1/customers") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Add customer", exact: true }).click(),
  ]);
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await expect(
    page.getByRole("button", { name: new RegExp(customerName) }),
  ).toBeVisible();
  await record(
    page,
    id,
    "CREDIT_GIVEN",
    "500",
    50000,
    testInfo.outputPath("hyderabad-transaction-review.png"),
  );
  await record(page, id, "REPAYMENT_RECEIVED", "200", 30000);
  await page
    .getByRole("button", { name: "Merchant Assistant", exact: true })
    .click();
  await expect(page.getByText(/Business date .* IST/)).toBeVisible();
  await page
    .getByRole("combobox", { name: "Commitment customer", exact: true })
    .selectOption(id);
  await page.getByRole("button", { name: "Review new commitment" }).click();
  await expect(page.locator("form.hyd-preview")).toBeFocused();
  await expect(page.getByLabel("Expected date (IST)")).not.toHaveValue("");
  await page.getByLabel("Promised amount (₹, optional)").fill("300");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Recorded synthetic expected date");
  await page.getByLabel("I reviewed this balance and expected date.").check();
  await page.screenshot({
    path: testInfo.outputPath("hyderabad-commitment-review.png"),
  });
  const [commitment] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/v1/commitments") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Save commitment change" }).click(),
  ]);
  expect(commitment.status()).toBe(201);
  expect(await commitment.json()).toMatchObject({
    customer_id: id,
    promised_amount_paise: 30000,
  });
  const due = page.getByRole("region", { name: "Due follow-ups" });
  const dueItem = due.getByRole("article").filter({ hasText: id });
  await expect(dueItem).toHaveCount(1);
  await expect(dueItem.getByText("Due today")).toBeVisible();
  await expect(dueItem.getByText(/₹300 recorded outstanding/)).toBeVisible();
  await page
    .getByLabel("Question", { exact: true })
    .fill("Why is " + customerName + " due?");
  const [answer] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/v1/assistant/questions") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Ask assistant" }).click(),
  ]);
  expect(answer.status()).toBe(200);
  const grounded = await answer.json();
  expect(grounded).toMatchObject({
    status: "ANSWER",
    answer_mode: "DETERMINISTIC",
    items: [
      expect.objectContaining({ customer_id: id, outstanding_paise: 30000 }),
    ],
  });
  expect(grounded.evidence_ids.length).toBeGreaterThan(0);
  await expect(page.getByText(/Recorded balance: ₹300/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("hyderabad-assistant-evidence.png"),
    fullPage: true,
  });
  await dueItem.getByRole("button", { name: "Review follow-up draft" }).click();
  const draftResponse = (response: Response) =>
    response.url().endsWith("/v1/followups/drafts") &&
    response.request().method() === "POST";
  const [unsent] = await Promise.all([
    page.waitForResponse(draftResponse),
    due
      .getByRole("button", { name: "Confirm review and prepare draft" })
      .click(),
  ]);
  expect(unsent.status()).toBe(200);
  expect(await unsent.json()).toMatchObject({
    status: "DRAFT_NOT_SENT",
    sent: false,
    outstanding_paise: 30000,
  });
  await expect(due.getByText("Draft not sent", { exact: true })).toBeVisible();

  // A second merchant view may post while this tab still displays its preview.
  const newDraft = await page.request.post("/v1/ledger/drafts", {
    data: {
      transcript: "",
      language: "en-IN",
      parsed_override: {
        customer_id: id,
        entry_type: "REPAYMENT_RECEIVED",
        amount_paise: 10000,
      },
    },
  });
  expect(newDraft.status()).toBe(201);
  const payment = await newDraft.json();
  const confirmation = await page.request.post(
    "/v1/ledger/drafts/" + payment.draft_id + "/confirm",
    {
      headers: { "Idempotency-Key": randomUUID() },
      data: { confirm: true, expected_version: payment.version },
    },
  );
  expect(confirmation.status()).toBe(201);
  expect((await confirmation.json()).outstanding_balance_paise).toBe(20000);
  const [stale] = await Promise.all([
    page.waitForResponse(draftResponse),
    due.getByRole("button", { name: "Check freshness and copy" }).click(),
  ]);
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toMatchObject({
    error: { code: "STALE_EVIDENCE" },
  });
  await expect(page.getByRole("alert")).toContainText("recorded facts changed");
  await expect(due.getByText("Draft not sent", { exact: true })).toHaveCount(0);
  await expect(dueItem.getByText(/₹200 recorded outstanding/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("hyderabad-stale-draft.png"),
    fullPage: true,
  });
  await dueItem.getByRole("button", { name: "Review follow-up draft" }).click();
  await due
    .getByRole("button", { name: "Confirm review and prepare draft" })
    .click();
  await expect(due.getByText(/current recorded balance of ₹200/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("hyderabad-unsent-desktop.png"),
    fullPage: true,
  });

  await record(page, id, "CREDIT_GIVEN", "500", 70000);
  await expect(
    dueItem.getByText("Ledger review required", { exact: true }),
  ).toBeVisible();
  await expect(dueItem.getByText(/₹700 recorded outstanding/)).toBeVisible();
  await expect(
    dueItem.getByRole("button", { name: "Review follow-up draft" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dueItem.getByText("Ledger review required", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("hyderabad-review-390.png"),
    fullPage: true,
  });
  const recordButton = page.getByRole("button", {
    name: "Record transaction",
    exact: true,
  });
  await recordButton.click();
  const mobileDialog = page.getByRole("dialog", {
    name: "Record a transaction",
  });
  const close = mobileDialog.getByRole("button", { name: "Close dialog" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  const exactFields = mobileDialog.getByRole("button", {
    name: "Exact fields",
    exact: true,
  });
  await expect(exactFields).toBeFocused();
  await expect(exactFields).toHaveCSS("outline-style", "solid");
  await expect(exactFields).toHaveCSS("outline-width", "3px");
  await page.screenshot({
    path: testInfo.outputPath("hyderabad-keyboard-390.png"),
  });
  await page.keyboard.press("Escape");
  await expect(mobileDialog).toBeHidden();
  await expect(recordButton).toBeFocused();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
