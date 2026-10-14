import { describe, expect, it } from "vitest";
import { STORAGE_KEY, createDoneStore, parseSaved } from "./doneCourses";
import type { SimpleStorage } from "./doneCourses";

// A stand-in for localStorage that keeps everything in a Map.
function fakeStorage(saved: Record<string, string> = {}): SimpleStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(saved));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

// A browser that refuses to use storage at all.
const blockedStorage: SimpleStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("parseSaved", () => {
  it("reads a saved list of course codes", () => {
    expect(parseSaved('["CPSC 110","CPSC 121"]')).toEqual(["CPSC 110", "CPSC 121"]);
  });

  it("gives an empty list for nothing saved or anything unexpected", () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved('{"CPSC 110": true}')).toEqual([]);
  });

  it("skips anything in the list that isn't text", () => {
    expect(parseSaved('["CPSC 110", 42, null]')).toEqual(["CPSC 110"]);
  });
});

describe("createDoneStore", () => {
  it("starts empty when nothing is saved", () => {
    const store = createDoneStore(() => fakeStorage());
    expect(parseSaved(store.getSnapshot())).toEqual([]);
  });

  it("loads what was saved before", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '["CPSC 210","CPSC 110"]' });
    const store = createDoneStore(() => storage);
    expect(parseSaved(store.getSnapshot())).toEqual(["CPSC 110", "CPSC 210"]);
  });

  it("adds and removes courses and saves them sorted", () => {
    const storage = fakeStorage();
    const store = createDoneStore(() => storage);
    store.toggle("CPSC 121");
    store.toggle("CPSC 110");
    expect(storage.data.get(STORAGE_KEY)).toBe('["CPSC 110","CPSC 121"]');
    store.toggle("CPSC 121");
    expect(storage.data.get(STORAGE_KEY)).toBe('["CPSC 110"]');
    store.clear();
    expect(storage.data.get(STORAGE_KEY)).toBe("[]");
  });

  it("gives the same text for the same courses, so React only re-renders on a real change", () => {
    const store = createDoneStore(() => fakeStorage());
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    store.toggle("CPSC 110");
    expect(store.getSnapshot()).not.toBe(before);
  });

  it("tells subscribers about each change until they unsubscribe", () => {
    const store = createDoneStore(() => fakeStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.toggle("CPSC 110");
    store.clear();
    unsubscribe();
    store.toggle("CPSC 210");
    expect(calls).toBe(2);
  });

  it("keeps working in memory when storage is blocked or missing", () => {
    for (const storage of [blockedStorage, null]) {
      const store = createDoneStore(() => storage);
      expect(parseSaved(store.getSnapshot())).toEqual([]);
      store.toggle("CPSC 110");
      expect(parseSaved(store.getSnapshot())).toEqual(["CPSC 110"]);
    }
  });
});
