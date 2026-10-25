import { useMemo, useSyncExternalStore } from "react";
import type { SimpleStorage } from "./doneCourses";
import { HIGH_SCHOOL_COURSES } from "./facts";

// Remembers what someone has said besides courses (their year standing and high school
// courses) in their browser's localStorage, next to their finished courses. Nothing is sent
// anywhere.

export const FACTS_KEY = "ubc-course-map:facts";

export interface SavedFacts {
  standing: number | null; // 1 to 4, null if not set
  highSchool: string[]; // keys of HIGH_SCHOOL_COURSES, sorted
}

const NOTHING_SAID: SavedFacts = { standing: null, highSchool: [] };
const KEYS = new Set(HIGH_SCHOOL_COURSES.map((course) => course.key));

// Turns saved text back into facts. Anything unexpected is left out instead of an error.
export function parseFacts(text: string | null): SavedFacts {
  if (text === null) return NOTHING_SAID;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return NOTHING_SAID;
    const { standing, highSchool } = value as Record<string, unknown>;
    return {
      standing: typeof standing === "number" && [1, 2, 3, 4].includes(standing) ? standing : null,
      highSchool: Array.isArray(highSchool)
        ? [...new Set(highSchool.filter((key): key is string => typeof key === "string" && KEYS.has(key)))].sort()
        : [],
    };
  } catch {
    return NOTHING_SAID;
  }
}

export interface FactsStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => string; // the saved text, so React can tell when it changed
  setStanding: (standing: number | null) => void;
  toggleHighSchool: (key: string) => void;
}

// Like the other stores, it keeps the facts in memory too, so the checklist still works when
// the browser blocks storage.
export function createFactsStore(getStorage: () => SimpleStorage | null): FactsStore {
  let text: string | null = null;
  const listeners = new Set<() => void>();

  function current(): string {
    if (text === null) {
      try {
        text = JSON.stringify(parseFacts(getStorage()?.getItem(FACTS_KEY) ?? null));
      } catch {
        text = JSON.stringify(NOTHING_SAID);
      }
    }
    return text;
  }

  function save(facts: SavedFacts): void {
    text = JSON.stringify(parseFacts(JSON.stringify(facts)));
    try {
      getStorage()?.setItem(FACTS_KEY, text);
    } catch {
      // Storage is blocked or full: keep them in memory only.
    }
    for (const listener of listeners) listener();
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: current,
    setStanding(standing) {
      save({ ...parseFacts(current()), standing });
    },
    toggleHighSchool(key) {
      const facts = parseFacts(current());
      const highSchool = facts.highSchool.includes(key)
        ? facts.highSchool.filter((k) => k !== key)
        : [...facts.highSchool, key];
      save({ ...facts, highSchool });
    },
  };
}

const store = createFactsStore(() => (typeof window === "undefined" ? null : window.localStorage));

// Nothing is said in the HTML made at build time; the browser fills in the saved facts
// straight after the page loads.
const nothingSaid = () => JSON.stringify(NOTHING_SAID);

// The saved facts, and functions to change them.
export function useSavedFacts() {
  const text = useSyncExternalStore(store.subscribe, store.getSnapshot, nothingSaid);
  const facts = useMemo(() => parseFacts(text), [text]);
  return { facts, setStanding: store.setStanding, toggleHighSchool: store.toggleHighSchool };
}
