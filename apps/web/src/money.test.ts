import { describe, it, expect } from "vitest";
import { toPaise } from "./api";
describe("exact rupee entry", () => {
  it("converts decimal text without float rounding", () => {
    expect(toPaise("0.29")).toBe(29);
    expect(toPaise("500")).toBe(50000);
    expect(toPaise("10.01")).toBe(1001);
  });
  it.each(["-1", "0", "1.001", "1e3", "NaN", "1000001", "0.001"])(
    "rejects ambiguous or out of bounds %s",
    (v) => expect(() => toPaise(v)).toThrow(),
  );
});
