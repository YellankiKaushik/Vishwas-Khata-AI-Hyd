import { test, expect } from "./offline-test";

test("mobile visit observation requires deliberate customer selection on every open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("total-outstanding")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Daily briefing", exact: true }).click();
  await page.getByRole("button", { name: "Record visit", exact: true }).click();
  const picker = page.getByRole("combobox", { name: "Customer", exact: true });
  await expect(picker).toHaveValue("");
  let writes = 0;
  page.on("request", (request) => { if (request.url().endsWith("/v1/observations/visits")) writes++; });
  await page.getByRole("button", { name: "Record synthetic observation", exact: true }).click();
  expect(writes).toBe(0);
  await expect(picker).toBeFocused();
  await picker.selectOption("cus_lakshmi");
  const before = await (await page.request.get("/v1/ledger/entries")).json();
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/v1/observations/visits")),
    page.getByRole("button", { name: "Record synthetic observation", exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().customer_id).toBe("cus_lakshmi");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Record visit", exact: true }).click();
  await expect(picker).toHaveValue("");
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect((await (await page.request.get("/v1/ledger/entries")).json()).items).toEqual(before.items);
  expect(writes).toBe(1);
});

test("posting and refreshing reuse the session and retain the original receipt after later repayment", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("total-outstanding")).toBeVisible();
  const context = (await (await page.request.get("/v1/voice/status")).json()).capture_context;
  const created = await page.request.post("/v1/customers", { data: { display_name: "Receipt snapshot " + Date.now() } });
  const cid = (await created.json()).id;
  await page.reload();
  await page.getByRole("button", { name: "Record transaction", exact: true }).click();
  await page.getByRole("combobox", { name: "Customer", exact: true }).selectOption(cid);
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and post", exact: true }).click();
  await expect(page.getByText("Recorded, with your confirmation.")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("vishwas.lastReceipt")!));
  expect(saved.result.outstanding_balance_paise).toBe(50000);
  const draft = await page.request.post("/v1/ledger/drafts", { data: { transcript: "", language: "en-IN", parsed_override: { customer_id: cid, entry_type: "REPAYMENT_RECEIVED", amount_paise: 20000 } } });
  const did = (await draft.json()).draft_id;
  expect((await page.request.post(`/v1/ledger/drafts/${did}/confirm`, { headers: { "Idempotency-Key": "receipt-later-" + Date.now() }, data: { confirm: true, expected_version: 1 } })).status()).toBe(201);
  const replay = await page.request.post(`/v1/ledger/drafts/${saved.operation.draft_id}/confirm`, { headers: { "Idempotency-Key": saved.operation.key }, data: { confirm: true, expected_version: saved.operation.version } });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(saved.result);
  await page.reload();
  await expect(page.getByTestId("total-outstanding")).toBeVisible();
  expect((await (await page.request.get(`/v1/customers/${cid}/balance`)).json()).outstanding_balance_paise).toBe(30000);
  expect((await (await page.request.get("/v1/voice/status")).json()).capture_context).toBe(context);
});

test("regional capture guidance exposes script language and keeps speech unverified", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Record transaction", exact: true }).click();
  await page.getByRole("button", { name: "Type / speak a sentence", exact: true }).click();
  for (const [language, tag, sentence] of [
    ["hi-IN", "hi", "रमेश को ५०० रुपये उधार दिए"],
    ["te-IN", "te", "రమేష్ ౫౦౦ రూపాయలు బాకీ తీసుకున్నాడు"],
  ]) {
    await page.getByLabel("Speech language", { exact: true }).selectOption(language);
    await expect(page.getByLabel("Sentence or corrected transcript")).toHaveAttribute("lang", tag);
    await page.getByLabel("Sentence or corrected transcript").fill(sentence);
    await expect(page.getByRole("dialog").locator(`p[lang="${tag}"]`)).toHaveCount(2);
    const textStyle = await page.getByRole("dialog").locator(`p[lang="${tag}"]`).first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { font: Number.parseFloat(style.fontSize), color: style.color };
    });
    expect(textStyle.font).toBeGreaterThanOrEqual(12);
    expect(textStyle.color).toBe("rgb(71, 97, 107)");
    await expect(page.getByText("Selected speech language is unverified.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transcribe recording", exact: true })).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Record transaction", exact: true })).toBeFocused();
});
