import type { ProgramKind } from "@/lib/program";

// The berry stripe that marks the picked program's courses: solid for a required course,
// striped for one of a few choices. The pattern means it never relies on colour alone.
// Used on the course boxes and in the keys; className sets its size and position.
export default function ProgramStripe({ kind, className }: { kind: ProgramKind; className: string }) {
  const background =
    kind === "required"
      ? "var(--program)"
      : "repeating-linear-gradient(45deg, var(--program) 0 2.5px, transparent 2.5px 5px)";
  return <span className={className} style={{ background }} aria-hidden />;
}

// A small upright sample of the stripe, for keys and buttons.
export function StripeSample({ kind }: { kind: ProgramKind }) {
  return <ProgramStripe kind={kind} className="mr-1.5 inline-block h-3.5 w-1.5 rounded-sm align-[-2px]" />;
}
