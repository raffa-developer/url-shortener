import { describe, expect, it } from "vitest";
import {
  BASE62_ALPHABET,
  decodeBase62,
  encodeBase62,
  randomShortCode,
} from "@url-shortener/shared";

describe("encodeBase62 / decodeBase62", () => {
  it("round-trips values", () => {
    for (const value of [0, 1, 61, 62, 12345, 999_999_999]) {
      expect(decodeBase62(encodeBase62(value))).toBe(BigInt(value));
    }
  });

  it("uses the full alphabet deterministically", () => {
    expect(encodeBase62(0)).toBe("a");
    expect(encodeBase62(61)).toBe("9");
    expect(encodeBase62(62)).toBe("ba");
  });

  it("rejects negative values", () => {
    expect(() => encodeBase62(-1)).toThrow(RangeError);
  });

  it("rejects invalid characters", () => {
    expect(() => decodeBase62("a!b")).toThrow(RangeError);
  });
});

describe("randomShortCode", () => {
  it("produces a code of the requested length using only base62 characters", () => {
    const code = randomShortCode(12);
    expect(code).toHaveLength(12);
    for (const char of code) {
      expect(BASE62_ALPHABET).toContain(char);
    }
  });

  it("uses rejection sampling to avoid modulo bias", () => {
    let offset = 0;
    const source = Uint8Array.from([0, 1, 61, 250, 62]);
    const byteSource = (length: number): Uint8Array => {
      const slice = source.slice(offset, offset + length);
      offset += length;
      return slice;
    };

    // 250 is >= 248 and is skipped; 62 wraps to index 0.
    expect(randomShortCode(4, byteSource)).toBe("ab9a");
  });

  it("rejects non-positive lengths", () => {
    expect(() => randomShortCode(0)).toThrow(RangeError);
  });
});
