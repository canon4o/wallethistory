import { translator } from "@/lib/i18n/translate";
import { describe, expect, it } from "vitest";
import { describeSchedule, describeStatus } from "@/lib/recurring/labels";

const t = translator("en");

describe("recurring labels", () => {
  it("describes how often a rule repeats", () => {
    expect(describeSchedule("daily", 1, t)).toBe("Every day");
    expect(describeSchedule("weekly", 2, t)).toBe("Every 2 weeks");
    expect(describeSchedule("monthly", 1, t)).toBe("Every month");
    expect(describeSchedule("yearly", 5, t)).toBe("Every 5 years");
  });

  it("describes a rule's status and why it is paused", () => {
    expect(describeStatus("active", null, t)).toBe("Active");
    expect(describeStatus("ended", null, t)).toBe("Ended");
    expect(describeStatus("paused", "manual", t)).toBe("Paused");
    expect(describeStatus("paused", null, t)).toBe("Paused");
    expect(describeStatus("paused", "stale", t)).toMatch(/over 2 years/);
    expect(describeStatus("paused", "household_link", t)).toMatch(/no longer shared/);
    expect(describeStatus("paused", "goal_closed", t)).toMatch(/goal is no longer open/);
  });
});
