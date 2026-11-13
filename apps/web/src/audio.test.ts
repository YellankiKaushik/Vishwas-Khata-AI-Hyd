import { it, expect } from "vitest";
import { encodePcm16 } from "./audio";
it("encodes actual signed PCM samples, header and bounds without changing filenames to pretend conversion", async () => {
  const blob = encodePcm16(new Float32Array([-2, -0.5, 0, 0.5, 2, NaN]));
  const view = new DataView(await blob.arrayBuffer());
  const text = (offset: number, n: number) =>
    String.fromCharCode(...new Uint8Array(view.buffer, offset, n));
  expect(text(0, 4)).toBe("RIFF");
  expect(text(8, 4)).toBe("WAVE");
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint16(34, true)).toBe(16);
  expect(
    Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)),
  ).toEqual([-32768, -16384, 0, 16383, 32767, 0]);
  expect(view.getUint32(40, true)).toBe(12);
  expect(blob.type).toBe("audio/wav");
});
it("rejects empty/overlong audio and unsupported rates", () => {
  expect(() => encodePcm16(new Float32Array())).toThrow();
  expect(() => encodePcm16(new Float32Array(16000 * 21))).toThrow();
  expect(() => encodePcm16(new Float32Array(10), 1000)).toThrow();
});
