import { describe, expect, it } from "vitest";
import {
  clickEventToFields,
  parseClickEventFields,
  type ClickEvent,
} from "../../src/queue/click-events";

const FULL_EVENT: ClickEvent = {
  linkId: "link-1",
  timestamp: "2026-09-13T15:42:11.000Z",
  userAgent: "curl/8.4.0",
  referrer: "https://www.google.com/search",
  country: "PT",
};

describe("click event serialization", () => {
  it("round-trips an event with every field", () => {
    expect(parseClickEventFields(clickEventToFields(FULL_EVENT))).toEqual(FULL_EVENT);
  });

  it("omits null fields and reads them back as null", () => {
    const sparse: ClickEvent = {
      linkId: "link-1",
      timestamp: FULL_EVENT.timestamp,
      userAgent: null,
      referrer: null,
      country: null,
    };

    const fields = clickEventToFields(sparse);
    expect(fields).toEqual(["linkId", "link-1", "timestamp", FULL_EVENT.timestamp]);
    expect(parseClickEventFields(fields)).toEqual(sparse);
  });

  it("rejects a payload without a linkId", () => {
    expect(parseClickEventFields(["timestamp", FULL_EVENT.timestamp])).toBeNull();
  });

  it("rejects a malformed timestamp", () => {
    expect(parseClickEventFields(["linkId", "link-1", "timestamp", "yesterday"])).toBeNull();
  });

  it("rejects an empty payload", () => {
    expect(parseClickEventFields([])).toBeNull();
  });

  it("ignores unknown fields", () => {
    const fields = [...clickEventToFields(FULL_EVENT), "unexpected", "value"];
    expect(parseClickEventFields(fields)).toEqual(FULL_EVENT);
  });

  it("tolerates a trailing key without a value", () => {
    const fields = [...clickEventToFields(FULL_EVENT), "dangling"];
    expect(parseClickEventFields(fields)).toEqual(FULL_EVENT);
  });
});
