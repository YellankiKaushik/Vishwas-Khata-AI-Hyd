import { test, expect } from "./offline-test";
import fs from "node:fs/promises";

test("desktop, projector and mobile keep Indic text and review controls visible", async ({
  page,
}) => {
  const results: Record<string, unknown>[] = [];
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(error.message));
  for (const [width, height] of [
    [1366, 768],
    [1600, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Record transaction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Type / speak a sentence", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Speech language", exact: true })
      .selectOption("te-IN");
    const text =
      "रमेश को 500 रुपये उधार दिए\nరమేష్ కి 500 రూపాయలు అప్పు ఇచ్చాను";
    const sentence = page.getByLabel("Sentence or corrected transcript");
    await sentence.fill(text);
    await expect(sentence).toHaveValue(text);
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeLessThanOrEqual(height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const review = page.getByRole("button", {
      name: "Review draft",
      exact: true,
    });
    await review.scrollIntoViewIfNeeded();
    await expect(review).toBeInViewport();
    await expect(page.getByRole("button", {name:"Close dialog",exact:true})).toBeInViewport();
    await sentence.scrollIntoViewIfNeeded();
    const file = `../../docs/evidence/f4-capture-${width}.png`;
    await page.screenshot({ path: file });
    results.push({
      viewport: { width, height },
      dialog: bounds,
      indic_text_preserved: true,
      horizontal_overflow: false,
      review_reachable: true,
      screenshot: file.split("/").pop(),
    });
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Record transaction", exact: true }),
    ).toBeFocused();
  }
  expect(crashes).toEqual([]);
  await fs.writeFile(
    "../../docs/evidence/f4-responsive.json",
    JSON.stringify(
      {
        classification: "ACTUAL_EDGE_VIEWPORT_REVIEW",
        physical_device: false,
        crashes,
        results,
      },
      null,
      2,
    ),
  );
});

test("malicious customer markup is literal text with no script or image execution", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("total-outstanding")).toBeVisible();
  const label = '<img src=x onerror="window.__customerInjected=1">';
  const created = await page.request.post("/v1/customers", {
    data: { display_name: label },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.getByPlaceholder("Search customer name or ID…").fill(label);
  await expect(
    page.getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(
    await page.evaluate(() => (window as any).__customerInjected || 0),
  ).toBe(0);
});
