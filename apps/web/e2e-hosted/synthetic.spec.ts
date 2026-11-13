import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("two isolated browsers complete the hosted ledger and review workflow", async ({ browser, baseURL }) => {
  const desktop = await browser.newContext({ baseURL });
  const mobile = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const page = await desktop.newPage();
    const other = await mobile.newPage();
    const blocked: string[] = [];
    const runtimeErrors: string[] = [];
    for (const tab of [page, other]) {
      tab.on("pageerror", error => runtimeErrors.push(error.message));
      tab.on("console", message => {
        if (message.type() === "error" && !/Failed to load resource:.*(?:401|409)/.test(message.text())) {
          runtimeErrors.push(message.text());
        }
      });
      tab.on("request", request => {
        if (["http:", "https:"].includes(new URL(request.url()).protocol) &&
            new URL(request.url()).origin !== new URL(baseURL!).origin) blocked.push(request.url());
      });
      await tab.goto(baseURL!);
      await expect(tab.getByText("Hosted demo", { exact: false }).first()).toBeVisible();
    }
    await expect.poll(() => other.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await other.getByRole("button", { name: "Open navigation" }).focus();
    await expect(other.getByRole("button", { name: "Open navigation" })).toBeFocused();

    const headers = { origin: new URL(baseURL!).origin };
    const request = desktop.request;
    const get = async (route: string) => {
      const result = await request.get("/v1" + route);
      expect(result.ok()).toBeTruthy();
      return result.json();
    };
    const write = async (route: string, data: unknown, operation?: string, idempotency = false, status = 200) => {
      const result = await request.post("/v1" + route, { data, headers: { ...headers,
        ...(operation ? { [idempotency ? "Idempotency-Key" : "Client-Operation-Id"]: operation } : {}) } });
      expect(result.status()).toBe(status);
      return result.json();
    };
    const merchant = await get("/merchants/me");
    expect((await (await mobile.request.get("/v1/merchants/me")).json()).id).not.toBe(merchant.id);
    const customer = (await get("/customers")).find((row: { display_name: string }) => row.display_name === "Ramesh");
    expect((await mobile.request.get("/v1/customers/" + customer.id + "/balance")).status()).toBe(404);

    await page.getByRole("button", { name: "Record transaction" }).click();
    await expect(page.getByRole("dialog", { name: "Record a transaction" })).toBeVisible();
    await page.getByRole("combobox", { name: /customer/i }).selectOption(customer.id);
    await page.getByRole("textbox", { name: "Exact amount in rupees" }).fill("500");
    await page.getByRole("button", { name: /review draft/i }).click();
    await expect(page.getByRole("dialog", { name: "Review your entry" })).toBeVisible();
    await page.getByRole("button", { name: /confirm.*post|confirm.*entry/i }).click();
    await expect.poll(async () => (await get("/customers/" + customer.id + "/balance")).outstanding_balance_paise).toBe(50000);

    const financial = async (paise: number, entry_type: string) => {
      const draft = await write("/ledger/drafts", { transcript: "", language: "en-IN",
        parsed_override: { customer_id: customer.id, entry_type, amount_paise: paise, currency: "INR" } }, randomUUID());
      const key = randomUUID();
      const send = () => write("/ledger/drafts/" + draft.draft_id + "/confirm",
        { confirm: true, expected_version: draft.version }, key, true);
      const receipts = await Promise.all([send(), send()]);
      expect(receipts[0]).toEqual(receipts[1]);
      return receipts[0].outstanding_balance_paise;
    };
    expect(await financial(20000, "REPAYMENT_RECEIVED")).toBe(30000);
    await page.reload();
    await page.getByRole("button", { name: "Merchant Assistant" }).click();
    await page.getByLabel("Commitment customer").selectOption(customer.id);
    await page.getByRole("button", { name: "Review new commitment" }).click();
    await expect(page.getByRole("heading", { name: "Record expected date" })).toBeVisible();
    const date = (await get("/followups/due")).as_of_date_ist;
    await page.getByLabel("Expected date (IST)").fill(date);
    await page.getByLabel(/Promised amount/).fill("300");
    await page.getByLabel("Reason", { exact: true }).fill("Synthetic review");
    await page.getByLabel("I reviewed this balance and expected date.").check();
    await page.getByRole("button", { name: /save commitment/i }).click();
    const due = page.getByRole("button", { name: "Review follow-up draft" });
    await expect(due).toBeVisible();
    const commitment = (await get("/followups/due")).items[0];
    expect((await get("/commitments/" + commitment.id + "/events")).items[0]).toMatchObject({
      event_type: "CREATED", reason: "Synthetic review",
    });
    await page.getByLabel("Question customer (optional)").selectOption(customer.id);
    await page.getByLabel("Question", { exact: true }).fill("How much does Ramesh owe?");
    await page.getByRole("button", { name: "Ask assistant" }).click();
    await expect(page.getByText(/Ramesh's recorded outstanding balance is/)).toBeVisible();
    await due.click();
    await page.getByRole("button", { name: "Confirm review and prepare draft" }).click();
    await expect(page.getByText("Draft not sent", { exact: true })).toBeVisible();
    expect(await financial(10000, "REPAYMENT_RECEIVED")).toBe(20000);
    const staleResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/v1/followups/drafts" && response.status() === 409);
    await page.getByRole("button", { name: "Check freshness and copy" }).click();
    expect((await (await staleResponse).json()).error.code).toBe("STALE_EVIDENCE");
    await expect(page.getByText("Draft not sent", { exact: true })).toHaveCount(0);
    expect(await financial(50000, "CREDIT_GIVEN")).toBe(70000);
    expect((await get("/commitments/" + commitment.id)).due_status).toBe("REVIEW_REQUIRED");
    const wrongTenant = await mobile.request.patch("/v1/commitments/" + commitment.id, {
      headers: { ...headers, "Client-Operation-Id": randomUUID() },
      data: { expected_version: 1, expected_date: date, promised_amount_paise: 30000,
        reviewed_ledger_hash: "0".repeat(64), review_latest_ledger: true, reason: "Synthetic isolation witness" },
    });
    expect(wrongTenant.status()).toBe(404);
    expect((await (await mobile.request.get("/v1/ledger/entries")).json()).items).toEqual([]);
    expect((await request.delete("/v1/demo/session", { headers })).ok()).toBeTruthy();
    expect((await request.get("/v1/merchants/me")).status()).toBe(401);
    expect(blocked).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
