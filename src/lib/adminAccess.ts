import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User | null | undefined) {
  if (!user) return false;

  const role =
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role.toLowerCase() : "";

  return role === "admin" || user.app_metadata?.is_admin === true;
}
