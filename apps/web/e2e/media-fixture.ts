import fs from "node:fs";
import path from "node:path";
// A non-speech synthetic tone: tests browser media handling, never ASR accuracy.
export function syntheticMediaPath() {
  const target = path.resolve("../../.tmp/browser-synthetic-tone.wav");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const n = 16000 * 3,
    bytes = Buffer.alloc(44 + n * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + n * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    bytes.writeInt16LE(
      Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / 16000)),
      44 + i * 2,
    );
  fs.writeFileSync(target, bytes);
  return target;
}
