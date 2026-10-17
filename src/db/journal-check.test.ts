import { describe, expect, it } from "vitest";

import { checkJournal, parseJournal, type JournalEntry } from "./journal-check";

const first: JournalEntry = { idx: 0, when: 100, tag: "0000_first" };
const second: JournalEntry = { idx: 1, when: 200, tag: "0001_second" };
const third: JournalEntry = { idx: 2, when: 300, tag: "0002_third" };

describe("checkJournal", () => {
  it("accepts strictly increasing entries that extend the base", () => {
    expect(checkJournal([first, second, third], [first, second])).toEqual([]);
  });

  it("rejects a migration whose when is not after the previous one (rebase)", () => {
    const stale = { ...third, when: 150 };
    expect(checkJournal([first, second, stale])).toEqual([
      expect.stringContaining(
        '0002_third: "when" 150 is not after 0001_second',
      ),
    ]);
  });

  it("rejects equal when values", () => {
    expect(checkJournal([first, { ...second, when: 100 }])).toHaveLength(1);
  });

  it("rejects gaps or repeats in idx", () => {
    expect(checkJournal([first, { ...third, idx: 2 }])).toEqual([
      "0002_third: idx 2, expected 1",
    ]);
  });

  it("rejects a branch that drops, reorders or rewrites base entries", () => {
    const base = [first, second];
    expect(checkJournal([first], base)).toEqual([
      expect.stringContaining("0001_second: already on the base branch"),
    ]);
    expect(
      checkJournal(
        [
          first,
          { ...third, idx: 1, when: 200 },
          { ...second, idx: 2, when: 300 },
        ],
        base,
      ),
    ).toContainEqual(
      expect.stringContaining("0001_second: already on the base branch"),
    );
    expect(checkJournal([first, { ...second, when: 250 }], base)).toHaveLength(
      1,
    );
  });
});

describe("parseJournal", () => {
  it("reads idx, when and tag", () => {
    const text = JSON.stringify({
      version: "7",
      entries: [
        { idx: 0, version: "7", when: 1, tag: "0000_a", breakpoints: true },
      ],
    });
    expect(parseJournal(text)).toEqual([{ idx: 0, when: 1, tag: "0000_a" }]);
  });

  it("rejects malformed journals", () => {
    expect(() => parseJournal("{}")).toThrow("journal has no entries list");
    expect(() => parseJournal('{"entries":[{"idx":0}]}')).toThrow(
      "journal entry 0 is malformed",
    );
  });
});
