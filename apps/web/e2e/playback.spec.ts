import { test, expect } from "./offline-test";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { syntheticMediaPath } from "./media-fixture";

async function briefing(page: import("@playwright/test").Page) {
  await page.route("**/v1/health/ready", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        tts_live_verified: true,
        tts_verified_languages: ["en-IN"],
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Daily briefing", exact: true })
    .click();
  await expect(page.locator(".briefing-slot")).toHaveCount(4);
}

test("mock audio needs an explicit request and supports play/pause/replay with cleanup on navigation", async ({
  page,
}) => {
  let calls = 0;
  const fixture = await fs.readFile(syntheticMediaPath());
  await page.route("**/v1/briefings/speech", (route) => {
    calls++;
    return route.fulfill({ contentType: "audio/wav", body: fixture });
  });
  await briefing(page);
  expect(calls).toBe(0);
  await page
    .getByRole("button", { name: "Listen to briefing", exact: true })
    .click();
  const player = page.getByLabel("Approved daily briefing audio");
  await expect(player).toBeVisible();
  expect(await player.evaluate((node: HTMLAudioElement) => node.paused)).toBe(
    true,
  );
  await player.evaluate(async (node: HTMLAudioElement) => {
    (window as any).__detachedPlayer = node;
    await node.play();
  });
  expect(await player.evaluate((node: HTMLAudioElement) => node.paused)).toBe(
    false,
  );
  await player.evaluate((node: HTMLAudioElement) => node.pause());
  expect(await player.evaluate((node: HTMLAudioElement) => node.paused)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Replay approved audio" }).click();
  await expect
    .poll(() => player.evaluate((node: HTMLAudioElement) => node.paused))
    .toBe(false);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).__detachedPlayer.paused),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as any).__detachedPlayer.getAttribute("src"),
    ),
  ).toBeNull();
  expect(calls).toBe(1); // This file is a non-speech fixture; no audible-human or live-TTS claim.
});

test("late mocked TTS cannot appear after navigating away and back", async ({
  page,
}) => {
  const fixture = await fs.readFile(syntheticMediaPath());
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/v1/briefings/speech", async (route) => {
    await held;
    await route
      .fulfill({ contentType: "audio/wav", body: fixture })
      .catch(() => {});
  });
  await briefing(page);
  const request = page.waitForRequest("**/v1/briefings/speech");
  await page
    .getByRole("button", { name: "Listen to briefing", exact: true })
    .click();
  await request;
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  release();
  await page
    .getByRole("button", { name: "Daily briefing", exact: true })
    .click();
  await expect(page.locator(".briefing-slot")).toHaveCount(4);
  await expect(page.getByLabel("Approved daily briefing audio")).toHaveCount(0);
});

test("actual offline provider failure keeps all four text sections and the ledger", async ({
  page,
}) => {
  await briefing(page);
  const before = await (await page.request.get("/v1/ledger/entries")).json();
  await page
    .getByRole("button", { name: "Listen to briefing", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "not passed an authenticated probe",
  );
  await expect(page.locator(".briefing-slot")).toHaveCount(4);
  expect(
    (await (await page.request.get("/v1/ledger/entries")).json()).items,
  ).toEqual(before.items);
});

test("retained authorized English WAV replays locally with historical provenance and no provider", async ({ page }) => {
  const audioPath = path.resolve("../../private/approved-briefing-probe.wav");
  test.skip(!existsSync(audioPath), "Private authorized WAV intentionally absent in a fresh checkout; no substitute speech is generated.");
  const original = JSON.parse(await fs.readFile("../../docs/completion/TTS_REPLAY_SNAPSHOT.json", "utf8"));
  const wav = await fs.readFile(audioPath);
  expect(createHash("sha256").update(wav).digest("hex")).toBe(original.audio_sha256);
  let localReplays = 0;
  await page.route("**/v1/briefings/speech", (route) => {
    localReplays++;
    return route.fulfill({ contentType: "audio/wav", body: wav });
  });
  await briefing(page);
  const before = await (await page.request.get("/v1/ledger/entries")).json();
  await page.getByRole("button", { name: "Listen to briefing", exact: true }).click();
  const player = page.getByLabel("Approved daily briefing audio");
  await expect(player).toBeVisible();
  const media = await player.evaluate(async (audio: HTMLAudioElement) => {
    if (audio.readyState < 1) await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(); audio.onerror = reject;
    });
    (window as any).__returnedAudio = audio;
    await audio.play(); const played = !audio.paused;
    audio.pause(); const paused = audio.paused;
    return { duration_seconds: audio.duration, played, paused };
  });
  expect(media.duration_seconds).toBeCloseTo(101.48, 1);
  expect(media.played && media.paused).toBe(true);
  await page.getByRole("button", { name: "Replay approved audio" }).click();
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  expect(await page.evaluate(() => ({ paused: (window as any).__returnedAudio.paused, source: (window as any).__returnedAudio.getAttribute("src") }))).toEqual({ paused: true, source: null });
  expect((await (await page.request.get("/v1/ledger/entries")).json()).items).toEqual(before.items);
  expect(localReplays).toBe(1);
  await fs.writeFile("../../docs/evidence/a2-retained-tts-replay.json", JSON.stringify({
    classification: "HISTORICAL_AUTHORIZED_WAV_LOCAL_COMPONENT_REPLAY",
    audio_sha256: original.audio_sha256, historical_facts_hash: original.facts_hash,
    historical_text_characters: original.characters, media, native_replay: true,
    detached_on_navigation: true, journal_unchanged: true, new_provider_requests: 0,
    current_briefing_text_agreement_claimed: false, human_audible_witness: false,
    note: "Test intercepts only this browser's audio/status. WAV belongs to the separately retained historical approved snapshot; no current-briefing or hearing claim.",
  }, null, 2));
});
