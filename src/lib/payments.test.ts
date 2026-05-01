import { describe, expect, it } from "vitest";

import {
  getCurrentWeekReference,
  getPaymentStatusFromMercadoPago,
  normalizePaymentStatus,
} from "./payments";

describe("payments helpers", () => {
  it("uses ISO week references", () => {
    expect(getCurrentWeekReference(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(getCurrentWeekReference(new Date("2026-03-28T12:00:00Z"))).toBe("2026-W13");
  });

  it("maps Mercado Pago statuses into the internal payment state", () => {
    expect(getPaymentStatusFromMercadoPago("approved")).toBe("paid");
    expect(getPaymentStatusFromMercadoPago("pending")).toBe("pending");
    expect(getPaymentStatusFromMercadoPago("rejected")).toBe("failed");
    expect(getPaymentStatusFromMercadoPago("unknown")).toBe("pending");
  });

  it("normalizes both legacy and backoffice statuses", () => {
    expect(normalizePaymentStatus("completed")).toBe("paid");
    expect(normalizePaymentStatus("paid")).toBe("paid");
    expect(normalizePaymentStatus("failed")).toBe("failed");
  });
});
