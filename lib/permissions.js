const MATRIX = {
  admin: new Set([
    "tasks:create:any",
    "tasks:edit:any",
    "projects:manage",
    "team:manage",
    "organization:manage",
    "integrations:self",
    "communications:self",
    "settings:self",
    "executive:view"
  ]),
  manager: new Set([
    "tasks:create:any",
    "tasks:edit:any",
    "projects:manage",
    "team:view",
    "integrations:self",
    "communications:self",
    "settings:self",
    "executive:view"
  ]),
  member: new Set([
    "tasks:create:self",
    "tasks:edit:self",
    "projects:view",
    "team:view",
    "integrations:self",
    "communications:self",
    "settings:self"
  ])
};

export function permissionsForRole(role) {
  return Array.from(MATRIX[role] || MATRIX.member);
}

export function can(session, permission) {
  return (MATRIX[session?.role] || MATRIX.member).has(permission);
}

export function requirePermission(session, permission) {
  if (!can(session, permission)) {
    const error = new Error("FORBIDDEN");
    error.status = 403;
    throw error;
  }
}

export function isPrivileged(session) {
  return session?.role === "admin" || session?.role === "manager";
}
