import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Response } from "@playwright/test";

const followupResponse = (response: Response) =>
  new URL(response.url()).pathname === "/v1/followups/drafts" && response.request().method() === "POST";

type ClipboardWitness = Window & { __followupClipboard: { writes: number } };

test("two isolated browsers complete the hosted ledger and review workflow", async ({ browser, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const token = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const desktop = await browser.newContext({ baseURL });
  const mobile = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    await desktop.addInitScript(() => {
      const witness = { writes: 0 };
      Object.defineProperty(window, "__followupClipboard", { value: witness });
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: async () => { witness.writes++; },
      });
    });
    if (token) {
      for (const context of [desktop, mobile]) {
        const bootstrap = await context.request.get("/", {
          headers: { "x-vercel-protection-bypass": token, "x-vercel-set-bypass-cookie": "true" },
          maxRedirects: 0,
        });
        expect(bootstrap.status()).toBeLessThan(400);
      }
    }
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

    const headers = { origin };
    const request = desktop.request;
    const get = async (route: string) => {
      const result = await request.get("/v1" + route, { maxRedirects: 0 });
      expect(result.ok()).toBeTruthy();
      return result.json();
    };
    await expect(page.getByRole("button", { name: "Record transaction" })).toBeEnabled();
    await expect(other.getByRole("button", { name: "Record transaction" })).toBeEnabled();
    const merchant = await get("/merchants/me");
    expect((await (await mobile.request.get("/v1/merchants/me", { maxRedirects: 0 })).json()).id).not.toBe(merchant.id);
    const customer = (await get("/customers")).find((row: { display_name: string }) => row.display_name === "Ramesh");
    expect((await mobile.request.get("/v1/customers/" + customer.id + "/balance", { maxRedirects: 0 })).status()).toBe(404);

    const financial = async (tab: Page, rupees: number, type: string, balance: number) => {
      await tab.getByRole("button", { name: "Record transaction" }).click();
      const capture = tab.getByRole("dialog", { name: "Record a transaction" });
      await capture.getByRole("combobox", { name: /customer/i }).selectOption(customer.id);
      await capture.getByRole("combobox", { name: "Transaction type" }).selectOption(type);
      await capture.getByRole("textbox", { name: "Exact amount in rupees" }).fill(String(rupees));
      await capture.getByRole("button", { name: /review draft/i }).click();
      const review = tab.getByRole("dialog", { name: "Review your entry" });
      await expect(review).toBeVisible();
      const posted = tab.waitForResponse(response => /\/v1\/ledger\/drafts\/[^/]+\/confirm$/.test(new URL(response.url()).pathname)
        && response.request().method() === "POST");
      await review.getByRole("button", { name: /confirm.*post|confirm.*entry/i }).click();
      const confirmation = await posted;
      expect(confirmation.status()).toBe(200);
      const original = await confirmation.json();
      expect(original.outstanding_balance_paise).toBe(balance);
      const originalRequest = confirmation.request();
      const key = await originalRequest.headerValue("idempotency-key");
      expect(key).toBeTruthy();
      const replay = () => request.post(new URL(originalRequest.url()).pathname, {
        headers: { ...headers, "Idempotency-Key": key! }, data: originalRequest.postDataJSON(), maxRedirects: 0,
      });
      for (const retry of await Promise.all([replay(), replay()])) {
        expect(retry.status()).toBe(200);
        expect(await retry.json()).toEqual(original);
      }
      await expect(review).toHaveCount(0);
      await expect.poll(async () => (await get("/customers/" + customer.id + "/balance")).outstanding_balance_paise).toBe(balance);
    };
    await financial(page, 500, "CREDIT_GIVEN", 50000);
    await financial(page, 200, "REPAYMENT_RECEIVED", 30000);
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
    const prepare = page.getByRole("button", { name: "Confirm review and prepare draft" });
    const unsent = page.getByText("Draft not sent", { exact: true });
    const copy = page.getByRole("button", { name: "Check freshness and copy" });
    const [draft] = await Promise.all([page.waitForResponse(followupResponse), prepare.click()]);
    expect(draft.status()).toBe(200);
    expect(await draft.json()).toMatchObject({ status: "DRAFT_NOT_SENT", sent: false, outstanding_paise: 30000 });
    await expect(unsent).toBeVisible();

    // Posting in this tab refreshes the workspace and discards its preview.
    // A second tab in the same session can change the ledger while this draft remains open.
    const repaymentTab = await desktop.newPage();
    await repaymentTab.goto(origin);
    await financial(repaymentTab, 100, "REPAYMENT_RECEIVED", 20000);
    await repaymentTab.close();
    const updated = await get("/commitments/" + commitment.id);
    expect(updated.outstanding_paise).toBe(20000);
    expect(updated.evidence_hash).not.toBe(commitment.evidence_hash);
    await expect(copy, "The original tab should still offer a freshness check").toBeEnabled();
    const [stale] = await Promise.all([
      page.waitForResponse(followupResponse, { timeout: 5000 }),
      copy.click(),
    ]);
    const code = (await stale.json().catch(() => null))?.error?.code;
    const safeCode = typeof code === "string" && /^[A-Z_]{1,40}$/.test(code) ? code : "UNKNOWN";
    console.log(`Follow-up freshness POST: HTTP ${stale.status()}, code ${safeCode}`);
    expect({ status: stale.status(), code: safeCode }).toEqual({ status: 409, code: "STALE_EVIDENCE" });
    expect(stale.request().postDataJSON().facts_hash === commitment.evidence_hash).toBe(true);
    expect(await page.evaluate(() => (window as unknown as ClipboardWitness).__followupClipboard.writes)).toBe(0);
    await expect(unsent).toHaveCount(0);
    await expect(copy).toHaveCount(0);

    await due.click();
    const [fresh] = await Promise.all([page.waitForResponse(followupResponse), prepare.click()]);
    expect(fresh.status()).toBe(200);
    expect(await fresh.json()).toMatchObject({ status: "DRAFT_NOT_SENT", sent: false, outstanding_paise: 20000 });
    await expect(unsent).toBeVisible();
    await financial(page, 500, "CREDIT_GIVEN", 70000);
    await expect(unsent, "A posting in the current tab should clear the preview").toHaveCount(0);
    await expect(copy).toHaveCount(0);
    expect((await get("/commitments/" + commitment.id)).due_status).toBe("REVIEW_REQUIRED");
    const wrongTenant = await mobile.request.patch("/v1/commitments/" + commitment.id, {
      maxRedirects: 0,
      headers: { ...headers, "Client-Operation-Id": randomUUID() },
      data: { expected_version: 1, expected_date: date, promised_amount_paise: 30000,
        reviewed_ledger_hash: "0".repeat(64), review_latest_ledger: true, reason: "Synthetic isolation witness" },
    });
    expect(wrongTenant.status()).toBe(404);
    expect((await (await mobile.request.get("/v1/ledger/entries", { maxRedirects: 0 })).json()).items).toEqual([]);
    expect((await request.delete("/v1/demo/session", { headers, maxRedirects: 0 })).ok()).toBeTruthy();
    expect((await request.get("/v1/merchants/me", { maxRedirects: 0 })).status()).toBe(401);
    expect(blocked).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
