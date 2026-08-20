import { SignJWT, jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { q } from "./db.js";

const enc = new TextEncoder();
const SESSION_COOKIE = "commanddesk_session";
const STATE_COOKIE = "commanddesk_oauth_state";

function demoMode() {
  return String(process.env.PILOT_DEMO_MODE || "false").toLowerCase() === "true";
}

function cookieValue(request, name) {
  return request.cookies?.get(name)?.value || null;
}

export async function signSession(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(enc.encode(secret));
}

export async function readSession(request) {
  if (demoMode()) {
    return {
      orgId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000101",
      role: "admin",
      name: "Administrador Pilot",
      email: "pilot@via.local",
      demo: true
    };
  }

  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, enc.encode(process.env.SESSION_SECRET));
    return payload;
  } catch {
    return null;
  }
}

export async function requireSession(request) {
  const session = await readSession(request);
  if (!session) {
    const error = new Error("UNAUTHORIZED");
    error.status = 401;
    throw error;
  }
  return session;
}

export async function createOAuthState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = Buffer.from(bytes).toString("base64url");
  return state;
}

export function stateCookieName() {
  return STATE_COOKIE;
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export async function validateMicrosoftIdToken(idToken) {
  const decoded = decodeJwt(idToken);
  const tid = decoded.tid;
  if (!tid) throw new Error("ID token sem tenant.");
  const jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`)
  );
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: process.env.MICROSOFT_CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${tid}/v2.0`
  });
  return payload;
}

export async function upsertMicrosoftIdentity(claims) {
  const tenantId = claims.tid;
  const oid = claims.oid || claims.sub;
  const email = claims.preferred_username || claims.email || null;
  const name = claims.name || email || "Usuário Microsoft";

  const orgResult = await q(
    `INSERT INTO organizations (name, microsoft_tenant_id)
     VALUES ($1, $2)
     ON CONFLICT (microsoft_tenant_id)
     DO UPDATE SET name = COALESCE(organizations.name, EXCLUDED.name)
     RETURNING id, name`,
    [claims.tid === "common" ? "Organização Microsoft" : (claims.tid || "Organização"), tenantId]
  );
  const org = orgResult.rows[0];

  const userResult = await q(
    `INSERT INTO users
      (organization_id, microsoft_oid, email, name, role, department)
     VALUES ($1,$2,$3,$4,'member','Geral')
     ON CONFLICT (organization_id, microsoft_oid)
     DO UPDATE SET email=EXCLUDED.email, name=EXCLUDED.name, updated_at=NOW()
     RETURNING id, organization_id, email, name, role, department`,
    [org.id, oid, email, name]
  );

  return { org, user: userResult.rows[0] };
}

export function demoModeEnabled() {
  return demoMode();
}
