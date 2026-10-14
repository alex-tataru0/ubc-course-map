import { useMemo, useSyncExternalStore } from "react";

// Remembers which courses someone has finished, in their browser's localStorage,
// so their list is still there after a reload. Nothing is sent anywhere.

export const STORAGE_KEY = "ubc-course-map:done";

// The two localStorage methods we use. Tests pass in a fake.
export type SimpleStorage = Pick<Storage, "getItem" | "setItem">;

// Turns saved text back into course codes. Anything unexpected (nothing saved yet,
// broken JSON, not a list) gives an empty list instead of an error.
export function parseSaved(text: string | null): string[] {
  if (text === null) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// The text to save: sorted and without repeats, so the same courses always save the same way.
function serialize(codes: Iterable<string>): string {
  return JSON.stringify([...new Set(codes)].sort());
}

export interface DoneStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => string; // the saved text; a string so React can tell when it changed
  toggle: (code: string) => void; // adds a course, or removes it if it's already there
  clear: () => void;
}

// The list also lives in memory, so the site still works when the browser blocks storage
// (some private windows do). Then changes last until the page is closed.
export function createDoneStore(getStorage: () => SimpleStorage | null): DoneStore {
  let text: string | null = null; // read from storage the first time it's needed
  const listeners = new Set<() => void>();

  function current(): string {
    if (text === null) {
      try {
        text = serialize(parseSaved(getStorage()?.getItem(STORAGE_KEY) ?? null));
      } catch {
        text = serialize([]);
      }
    }
    return text;
  }

  function save(codes: Iterable<string>): void {
    text = serialize(codes);
    try {
      getStorage()?.setItem(STORAGE_KEY, text);
    } catch {
      // Storage is blocked or full: keep the list in memory only.
    }
    for (const listener of listeners) listener();
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: current,
    toggle(code) {
      const codes = new Set(parseSaved(current()));
      if (codes.has(code)) codes.delete(code);
      else codes.add(code);
      save(codes);
    },
    clear() {
      save([]);
    },
  };
}

// One store for the whole page. There's no localStorage during the build, so it's only
// looked up in the browser.
const store = createDoneStore(() => (typeof window === "undefined" ? null : window.localStorage));

// Nothing is finished in the HTML made at build time; the browser fills in the saved list
// straight after the page loads (the same trick as the dark mode setting).
const nothingSaved = () => serialize([]);

// The finished courses, plus functions to change them. Every component that uses this
// sees the same list and re-renders when it changes.
export function useDoneCourses() {
  const text = useSyncExternalStore(store.subscribe, store.getSnapshot, nothingSaved);
  const done: ReadonlySet<string> = useMemo(() => new Set(parseSaved(text)), [text]);
  return { done, toggle: store.toggle, clear: store.clear };
}
