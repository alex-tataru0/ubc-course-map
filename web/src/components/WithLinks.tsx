import { splitLinks } from "@/lib/links";

// Text from the calendar, with any web addresses in it as short links that open in a new tab.
export default function WithLinks({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        "url" in part ? (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink-muted"
          >
            {part.label}
            <span aria-hidden> ↗</span>
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
