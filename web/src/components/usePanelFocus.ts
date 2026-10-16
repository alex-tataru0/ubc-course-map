import { useEffect, useLayoutEffect, useRef } from "react";

// Keyboard focus for the side panels.
// - When a panel opens, focus moves to its heading, so Tab carries on inside the panel and
//   screen readers say what opened. It moves there again whenever `showing` changes (another
//   course in the same panel), since the link that was clicked may be gone.
// - When the panel closes (× or Esc) with focus inside it, focus goes to `returnTo()` (the
//   course on the map, the button over the map), or else back to whatever had it before the
//   panel opened. If focus was somewhere else (a click on the map), it stays there.
// Returns the ref for the heading, which needs tabIndex={-1} to take focus.
export function usePanelFocus(showing: unknown, returnTo?: () => HTMLElement | null) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null | undefined>(undefined); // undefined until it first opens
  const hadFocus = useRef(false);
  const returnToRef = useRef(returnTo);
  useEffect(() => {
    returnToRef.current = returnTo;
  });

  useEffect(() => {
    if (opener.current === undefined) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [showing]);

  // Whether focus is inside the panel as it closes. This runs just before the panel leaves
  // the page; after that, focus inside it is lost to the page itself.
  useLayoutEffect(() => {
    const panel = headingRef.current?.closest("aside");
    return () => {
      hadFocus.current = panel?.contains(document.activeElement) ?? false;
    };
  }, []);

  useEffect(
    () => () => {
      const active = document.activeElement;
      if (!hadFocus.current || (active !== null && active !== document.body)) return;
      const target = returnToRef.current?.() ?? opener.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    },
    [],
  );

  return headingRef;
}
