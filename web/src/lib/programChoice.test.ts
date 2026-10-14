import { describe, expect, it } from "vitest";
import type { SimpleStorage } from "./doneCourses";
import { PROGRAM_KEY, createProgramStore, parseProgram } from "./programChoice";

// A stand-in for localStorage that keeps everything in a Map.
function fakeStorage(saved: Record<string, string> = {}): SimpleStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(saved));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const blockedStorage: SimpleStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("parseProgram", () => {
  it("reads a saved program id", () => {
    expect(parseProgram('"cpsc-major"')).toBe("cpsc-major");
  });

  it("gives null for nothing saved or anything unexpected", () => {
    expect(parseProgram(null)).toBeNull();
    expect(parseProgram("null")).toBeNull();
    expect(parseProgram("not json")).toBeNull();
    expect(parseProgram('["cpsc-major"]')).toBeNull();
  });
});

describe("createProgramStore", () => {
  it("starts with no program, then loads the one saved before", () => {
    expect(createProgramStore(() => fakeStorage()).getSnapshot()).toBeNull();
    const storage = fakeStorage({ [PROGRAM_KEY]: '"cpsc-se-honours"' });
    expect(createProgramStore(() => storage).getSnapshot()).toBe("cpsc-se-honours");
  });

  it("saves a new choice, and forgets it", () => {
    const storage = fakeStorage();
    const store = createProgramStore(() => storage);
    store.pick("cpsc-honours");
    expect(store.getSnapshot()).toBe("cpsc-honours");
    expect(storage.data.get(PROGRAM_KEY)).toBe('"cpsc-honours"');
    store.pick(null);
    expect(store.getSnapshot()).toBeNull();
    expect(storage.data.get(PROGRAM_KEY)).toBe("null");
  });

  it("tells subscribers about each change until they unsubscribe", () => {
    const store = createProgramStore(() => fakeStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.pick("cpsc-major");
    unsubscribe();
    store.pick(null);
    expect(calls).toBe(1);
  });

  it("keeps working in memory when storage is blocked or missing", () => {
    for (const storage of [blockedStorage, null]) {
      const store = createProgramStore(() => storage);
      expect(store.getSnapshot()).toBeNull();
      store.pick("cpsc-major");
      expect(store.getSnapshot()).toBe("cpsc-major");
    }
  });
});
