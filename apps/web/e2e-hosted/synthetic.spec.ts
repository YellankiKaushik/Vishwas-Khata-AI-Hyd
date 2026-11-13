import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("two isolated browsers complete the hosted ledger and review workflow", async ({ browser, baseURL }) => {
  const desktop = await browser.newContext();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await desktop.newPage();
    const other = await mobile.newPage();
    const blocked: string[] = [];
    for (const tab of [page, other]) {
      tab.on("request", request => {
        if (new URL(request.url()).origin !== new URL(baseURL!).origin) blocked.push(request.url());
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
    const balance = await get("/customers/" + customer.id + "/balance?include_review_token=true");
    const date = (await get("/followups/due")).as_of_date_ist;
    const commitment = await write("/commitments", { customer_id: customer.id, expected_date: date,
      promised_amount_paise: 30000, reviewed_ledger_hash: balance.ledger_hash, reason: "Synthetic review" }, randomUUID());
    expect((await get("/followups/due")).items[0].id).toBe(commitment.id);
    const answer = await write("/assistant/questions", { question: "How much does Ramesh owe?",
      customer_id: customer.id, language: "en-IN", request_id: randomUUID() });
    expect(answer.items[0].outstanding_paise).toBe(30000);
    const followup = { commitment_id: commitment.id, expected_version: commitment.version,
      language: "en-IN", tone: "POLITE", facts_hash: commitment.evidence_hash, confirm_review: true };
    expect(await write("/followups/drafts", followup)).toMatchObject({ status: "DRAFT_NOT_SENT", sent: false });
    expect(await financial(10000, "REPAYMENT_RECEIVED")).toBe(20000);
    expect((await write("/followups/drafts", followup, undefined, false, 409)).error.code).toBe("STALE_EVIDENCE");
    expect(await financial(50000, "CREDIT_GIVEN")).toBe(70000);
    expect((await get("/commitments/" + commitment.id)).due_status).toBe("REVIEW_REQUIRED");
    expect((await (await mobile.request.get("/v1/ledger/entries")).json()).items).toEqual([]);
    expect((await request.delete("/v1/demo/session", { headers })).ok()).toBeTruthy();
    expect((await request.get("/v1/merchants/me")).status()).toBe(401);
    expect(blocked).toEqual([]);
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
