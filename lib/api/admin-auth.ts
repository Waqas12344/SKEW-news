import "server-only";
import type { NextRequest } from "next/server";

/**
 * Returns true when the request carries a valid Biasly_Admin_Secret header.
 * Used by all action routes (§15). Secret is server-only — never logged.
 */
export function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("Biasly_Admin_Secret");
  return Boolean(secret && secret === process.env.BIASLY_ADMIN_SECRET);
}
