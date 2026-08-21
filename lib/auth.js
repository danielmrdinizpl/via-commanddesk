import { SignJWT, jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { q } from "./db.js";

const enc = new TextEncoder();
const SESSION_COOKIE = "commanddesk_session";
const STATE_COOKIE = "commanddesk_oauth_state";
const TENANT_BIND_STATE_COOKIE = "commanddesk_tenant_bind_state";

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
  return Buffer.from(bytes).toString("base64url");
}

export function stateCookieName() {
  return STATE_COOKIE;
}

export function tenantBindStateCookieName() {
  return TENANT_BIND_STATE_COOKIE;
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
  const email = String(claims.preferred_username || claims.email || "").trim().toLowerCase() || null;

  if (!tenantId || !oid || !email) {
    const error = new Error("MICROSOFT_IDENTITY_INCOMPLETE");
    error.status = 403;
    throw error;
  }

  const orgResult = await q(
    `SELECT id,name,microsoft_tenant_id
     FROM organizations
     WHERE microsoft_tenant_id=$1
     LIMIT 1`,
    [tenantId]
  );

  if (!orgResult.rowCount) {
    const error = new Error("TENANT_NOT_PROVISIONED");
    error.status = 403;
    throw error;
  }
  const org = orgResult.rows[0];

  let userResult = await q(
    `SELECT id,organization_id,microsoft_oid,email,name,role,department,job_title
     FROM users
     WHERE organization_id=$1 AND microsoft_oid=$2
     LIMIT 1`,
    [org.id, oid]
  );

  if (!userResult.rowCount) {
    userResult = await q(
      `SELECT id,organization_id,microsoft_oid,email,name,role,department,job_title
       FROM users
       WHERE organization_id=$1 AND lower(email)=lower($2)
       LIMIT 1`,
      [org.id, email]
    );

    if (!userResult.rowCount) {
      const error = new Error("USER_NOT_PROVISIONED");
      error.status = 403;
      throw error;
    }

    const existing = userResult.rows[0];
    if (existing.microsoft_oid && existing.microsoft_oid !== oid) {
      const error = new Error("MICROSOFT_IDENTITY_CONFLICT");
      error.status = 409;
      throw error;
    }

    userResult = await q(
      `UPDATE users
       SET microsoft_oid=$1,
           email=COALESCE(email,$2),
           updated_at=NOW()
       WHERE id=$3 AND organization_id=$4
       RETURNING id,organization_id,microsoft_oid,email,name,role,department,job_title`,
      [oid, email, existing.id, org.id]
    );
  }

  return { org, user: userResult.rows[0] };
}

export function demoModeEnabled() {
  return demoMode();
}
