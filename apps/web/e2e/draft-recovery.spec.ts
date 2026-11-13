import { test, expect } from "./offline-test";

test("draft creation survives lost response and reload with the original creation intent", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption("cus_ramesh");
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("500");
  let id = "",
    key = "";
  await page.route(
    "**/v1/ledger/drafts",
    async (route) => {
      key = route.request().headers()["client-operation-id"];
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      id = (await response.json()).draft_id;
      await route.abort("connectionfailed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Recover saved draft", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Record transaction", exact: true })
    .click();
  const [replay] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/ledger/drafts")),
    page
      .getByRole("button", { name: "Recover saved draft", exact: true })
      .click(),
  ]);
  expect(replay.status()).toBe(200);
  expect((await replay.json()).draft_id).toBe(id);
  expect(replay.request().headers()["client-operation-id"]).toBe(key);
  await expect(
    page.getByRole("dialog").getByText("₹500", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel this draft" }).click();
});

test("stale draft returns to current review and dialog restores keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Record transaction",
    exact: true,
  });
  await trigger.click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .selectOption("cus_ramesh");
  await page.getByLabel("Exact amount in rupees", { exact: true }).fill("500");
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/v1/ledger/drafts")),
    page.getByRole("button", { name: "Review draft", exact: true }).click(),
  ]);
  const d = await created.json();
  const before = await (await page.request.get("/v1/ledger/entries")).json();
  expect(
    (
      await page.request.patch("/v1/ledger/drafts/" + d.draft_id, {
        data: {
          expected_version: 1,
          customer_id: "cus_ramesh",
          entry_type: "CREDIT_GIVEN",
          amount_paise: 45000,
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Confirm and post", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeFocused();
  await expect(
    page.getByRole("dialog").getByText("₹450", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm and post", exact: true }),
  ).toBeEnabled();
  expect(
    (await (await page.request.get("/v1/ledger/entries")).json()).items.length,
  ).toBe(before.items.length);
  await page.getByRole("button", { name: "Cancel this draft" }).click();
});
