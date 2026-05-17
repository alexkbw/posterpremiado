import { describe, expect, it } from "vitest";

import { formatTicketNumber, getPromotionContestCode, normalizePackageSize } from "./posters";

describe("normalizePackageSize", () => {
  it("preserves valid dynamic package sizes", () => {
    expect(normalizePackageSize(15)).toBe(15);
    expect(normalizePackageSize(250)).toBe(250);
  });

  it("falls back for invalid values", () => {
    expect(normalizePackageSize(undefined)).toBe(10);
    expect(normalizePackageSize(0)).toBe(10);
    expect(normalizePackageSize(-9)).toBe(10);
  });

  it("caps values at the ticket pool limit", () => {
    expect(normalizePackageSize(10000)).toBe(9999);
  });
});

describe("getPromotionContestCode", () => {
  it("prefers the explicit contest code", () => {
    expect(getPromotionContestCode({ contest_code: "FED-6054", id: 1 })).toBe("FED-6054");
  });

  it("falls back to the promotion id when needed", () => {
    expect(getPromotionContestCode({ contest_code: "", id: 2 })).toBe("2");
  });
});

describe("formatTicketNumber", () => {
  it("renders promotion numbers with six digits", () => {
    expect(formatTicketNumber(0)).toBe("000000");
    expect(formatTicketNumber(1)).toBe("000001");
    expect(formatTicketNumber(999999)).toBe("999999");
  });
});
