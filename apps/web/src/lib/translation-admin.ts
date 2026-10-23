import "server-only";

export function adminUserIds() {
  return (process.env.NEXT_PUBLIC_ADMIN_USERS ?? "")
    .replace(/[[\]"'\s]/g, "")
    .split(",")
    .filter(Boolean);
}
