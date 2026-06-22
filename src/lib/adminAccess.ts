import type { User } from "@supabase/supabase-js";

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isAdminUser(user: User | null | undefined) {
  if (!user) return false;

  const role =
    typeof user.app_metadata?.role === "string" ? user.app_metadata.role.toLowerCase() : "";

  const email = typeof user.email === "string" ? user.email.toLowerCase() : "";

  return (
    role === "admin" ||
    user.app_metadata?.is_admin === true ||
    (email.length > 0 && ADMIN_EMAILS.includes(email))
  );
}
