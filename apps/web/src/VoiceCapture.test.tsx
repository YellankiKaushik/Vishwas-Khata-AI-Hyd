import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VoiceCapture } from "./VoiceCapture";

afterEach(() => vi.unstubAllGlobals());
it("renders a visibly labelled local recording button with cloud speech disabled", () => {
  vi.stubGlobal("window", { MediaRecorder: function () {}, isSecureContext: true });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia() {} } });
  vi.stubGlobal("AudioContext", function () {});
  vi.stubGlobal("OfflineAudioContext", function () {});
  const html = renderToStaticMarkup(<VoiceCapture language="en-IN" providerAvailable={false} onTranscript={() => {}} onActivity={() => {}} />);
  expect(html).toMatch(/<button[^>]*aria-label="Record voice"[^>]*>/);
  expect(html).toContain('Record voice</button>');
  expect(html).toContain("Local recording available · cloud transcription unavailable");
  expect(html).not.toContain("Transcribe recording</button>");
  expect(html).not.toContain("disabled=");
});
