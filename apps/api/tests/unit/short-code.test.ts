import { describe, expect, it } from "vitest";
import { isReservedShortCode, isValidCustomAlias } from "@url-shortener/shared";

describe("isValidCustomAlias", () => {
  it("accepts letters, numbers, hyphens and underscores", () => {
    expect(isValidCustomAlias("summer-sale")).toBe(true);
    expect(isValidCustomAlias("promo_2026")).toBe(true);
    expect(isValidCustomAlias("aB72x")).toBe(true);
  });

  it("rejects aliases that are too short or too long", () => {
    expect(isValidCustomAlias("ab")).toBe(false);
    expect(isValidCustomAlias("x".repeat(33))).toBe(false);
  });

  it("rejects aliases with invalid characters", () => {
    expect(isValidCustomAlias("summer sale")).toBe(false);
    expect(isValidCustomAlias("sale/summer")).toBe(false);
    expect(isValidCustomAlias("sale?x=1")).toBe(false);
  });
});

describe("isReservedShortCode", () => {
  it("flags reserved application routes", () => {
    expect(isReservedShortCode("api")).toBe(true);
    expect(isReservedShortCode("health")).toBe(true);
    expect(isReservedShortCode("admin")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isReservedShortCode("API")).toBe(true);
    expect(isReservedShortCode("Health")).toBe(true);
  });

  it("does not flag normal aliases", () => {
    expect(isReservedShortCode("summer-sale")).toBe(false);
  });
});
