import { visibleText } from "@/domain/text";

// The kind of a note (US-020, RF-006, ADR-0007): a key concept, a quote (with the page or position
// it came from) or an action or question (which can be marked as resolved). Pure; the error values
// are i18n keys under `notes.errors` (rule i18n).

export const NOTE_TYPES = [
  "key_concept",
  "quote",
  "action_or_question",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const isNoteType = (value: unknown): value is NoteType =>
  (NOTE_TYPES as readonly unknown[]).includes(value);

// Format characters (zero-width spaces and joiners, direction marks, BOM): a reference made of
// them would look blank or reorder "p. 12–40" (security review, US-020).
const INVISIBLE_FORMAT = /\p{Cf}/u;

// Room for "p. 1234–1240", "posição 12345" or "cap. 3, §2".
export const NOTE_REFERENCE_MAX = 50;

export const noteTypeErrors = {
  invalidType: "invalidType",
  referenceRequired: "referenceRequired",
  referenceTooLong: "referenceTooLong",
  referenceInvalid: "referenceInvalid",
} as const;

export type NoteTypeError =
  (typeof noteTypeErrors)[keyof typeof noteTypeErrors];

export type NoteKind =
  | { type: "key_concept" | "action_or_question"; reference: null }
  | { type: "quote"; reference: string };

export type ParsedNoteKind =
  { ok: true; kind: NoteKind } | { ok: false; error: NoteTypeError };

// A quote requires its reference (trimmed, one visible line); the other kinds never keep one, so
// changing a quote into another kind drops it.
export function parseNoteKind(
  type: unknown,
  reference: unknown,
): ParsedNoteKind {
  if (!isNoteType(type))
    return { ok: false, error: noteTypeErrors.invalidType };
  if (type !== "quote") return { ok: true, kind: { type, reference: null } };

  if (
    reference !== undefined &&
    reference !== null &&
    typeof reference !== "string"
  ) {
    return { ok: false, error: noteTypeErrors.referenceInvalid };
  }
  const trimmed = (reference ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, error: noteTypeErrors.referenceRequired };
  }
  if (trimmed.length > NOTE_REFERENCE_MAX) {
    return { ok: false, error: noteTypeErrors.referenceTooLong };
  }
  if (!visibleText(trimmed) || INVISIBLE_FORMAT.test(trimmed)) {
    return { ok: false, error: noteTypeErrors.referenceInvalid };
  }
  return { ok: true, kind: { type, reference: trimmed } };
}

// Only actions and questions are resolved; changing the kind of a resolved one reopens nothing,
// it simply stops being resolvable.
export const isResolvable = (type: NoteType) => type === "action_or_question";
