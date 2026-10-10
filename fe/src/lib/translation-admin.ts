import "server-only";

export function adminUserIds() {
  return (process.env.ADMIN_USERS ?? "")
    .replace(/[[\]"'\s]/g, "")
    .split(",")
    .filter(Boolean);
}
