import { useSyncExternalStore } from "react";
import type { SimpleStorage } from "./doneCourses";

// Remembers the program someone picked (e.g. "cpsc-major") in their browser's localStorage,
// next to their finished courses, so it's still picked after a reload. null means none.

export const PROGRAM_KEY = "ubc-course-map:program";

// Turns saved text back into a program id. Anything unexpected gives null instead of an error.
export function parseProgram(text: string | null): string | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export interface ProgramStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => string | null;
  pick: (id: string | null) => void; // null forgets the program
}

// Like the store for finished courses (createDoneStore), it keeps the choice in memory too,
// so picking a program still works when the browser blocks storage.
export function createProgramStore(getStorage: () => SimpleStorage | null): ProgramStore {
  let id: string | null | undefined; // undefined until read from storage the first time
  const listeners = new Set<() => void>();

  function current(): string | null {
    if (id === undefined) {
      try {
        id = parseProgram(getStorage()?.getItem(PROGRAM_KEY) ?? null);
      } catch {
        id = null;
      }
    }
    return id;
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: current,
    pick(next) {
      id = next;
      try {
        getStorage()?.setItem(PROGRAM_KEY, JSON.stringify(next));
      } catch {
        // Storage is blocked or full: remember it in memory only.
      }
      for (const listener of listeners) listener();
    },
  };
}

// One store for the whole page, only looked up in the browser.
const store = createProgramStore(() => (typeof window === "undefined" ? null : window.localStorage));

// No program is picked in the HTML made at build time; the browser fills in the saved one
// straight after the page loads.
const nothingPicked = () => null;

// The picked program's id, and a function to change it.
export function useProgramChoice() {
  const programId = useSyncExternalStore(store.subscribe, store.getSnapshot, nothingPicked);
  return { programId, pickProgram: store.pick };
}
