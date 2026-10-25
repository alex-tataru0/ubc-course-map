import { describe, expect, it } from "vitest";
import type { SimpleStorage } from "./doneCourses";
import { createFactsStore, FACTS_KEY, parseFacts } from "./savedFacts";

// A stand-in for localStorage that keeps everything in a Map.
function fakeStorage(saved: Record<string, string> = {}): SimpleStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(saved));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("parseFacts", () => {
  it("reads saved facts", () => {
    expect(parseFacts('{"standing":3,"highSchool":["PHYS 12","CHEM 12"]}')).toEqual({
      standing: 3,
      highSchool: ["CHEM 12", "PHYS 12"],
    });
  });

  it("leaves out anything unexpected", () => {
    expect(parseFacts(null)).toEqual({ standing: null, highSchool: [] });
    expect(parseFacts("not json")).toEqual({ standing: null, highSchool: [] });
    expect(parseFacts('{"standing":7,"highSchool":["PHYS 12","Art 12",3]}')).toEqual({
      standing: null,
      highSchool: ["PHYS 12"],
    });
  });
});

describe("createFactsStore", () => {
  it("saves the year and high school ticks", () => {
    const storage = fakeStorage();
    const store = createFactsStore(() => storage);
    store.setStanding(2);
    store.toggleHighSchool("PHYS 12");
    store.toggleHighSchool("BIOL 12");
    store.toggleHighSchool("PHYS 12");
    expect(JSON.parse(storage.data.get(FACTS_KEY)!)).toEqual({ standing: 2, highSchool: ["BIOL 12"] });
    // A new page load reads them back.
    expect(parseFacts(createFactsStore(() => storage).getSnapshot())).toEqual({ standing: 2, highSchool: ["BIOL 12"] });
  });

  it("tells listeners, and works in memory when storage is blocked", () => {
    const store = createFactsStore(() => {
      throw new Error("blocked");
    });
    let calls = 0;
    store.subscribe(() => calls++);
    store.setStanding(4);
    expect(parseFacts(store.getSnapshot()).standing).toBe(4);
    expect(calls).toBe(1);
  });
});
