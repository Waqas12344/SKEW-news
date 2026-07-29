import "server-only";
import type { NextRequest } from "next/server";

/**
 * Returns true when the request carries a valid x-skew-admin-secret header.
 * Used by all action routes (§15). Secret is server-only — never logged.
 */
export function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-skew-admin-secret");
  return Boolean(secret && secret === process.env.SKEW_ADMIN_SECRET);
}
