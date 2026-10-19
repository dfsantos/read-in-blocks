import { notFound } from "next/navigation";

// Turns a repository miss into Next's 404 (zero-trust.md, 1.4). Repositories return undefined both
// for a missing resource and for another reader's, so pages answer both with the same 404 page and
// never a 403 that would confirm the resource exists.
// null counts as a miss too, so a repository that answers `row ?? null` still yields a 404.
export function foundOrNotFound<T>(resource: T | null | undefined): T {
  if (resource === undefined || resource === null) notFound();
  return resource;
}
