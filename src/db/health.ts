import { appMeta } from "./schema";
import { getDb } from "./client";

// Confirms the app role can connect and read a migrated table.
// Never throws and never exposes error details to the caller.
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await getDb().select({ key: appMeta.key }).from(appMeta).limit(1);
    return true;
  } catch (error) {
    const code =
      (error as { code?: string }).code ??
      (error as { cause?: { code?: string } }).cause?.code;
    console.error("health: database check failed", { code });
    return false;
  }
}
