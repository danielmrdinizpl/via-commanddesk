import { decryptSecret, encryptSecret } from "./crypto.js";
import { q } from "./db.js";

const scopes = "openid profile email offline_access User.Read Mail.Read";

function resolveRedirectUri(redirectUri) {
  return redirectUri || `${process.env.APP_URL}/api/auth/callback`;
}

export function authorizeUrl(state, redirectUri) {
  const tenant = process.env.MICROSOFT_TENANT_ID || "organizations";
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: resolveRedirectUri(redirectUri),
    response_mode: "query",
    scope: scopes,
    state
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeCode(code, redirectUri) {
  const tenant = process.env.MICROSOFT_TENANT_ID || "organizations";
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: resolveRedirectUri(redirectUri),
    scope: scopes
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || "Falha ao trocar código Microsoft.");
  return json;
}

export async function storeMicrosoftTokens(orgId, userId, tokenResponse) {
  if (!tokenResponse.refresh_token) return;
  await q(
    `INSERT INTO integration_accounts
      (organization_id,user_id,provider,refresh_token_enc,scopes,connected_at,updated_at)
     VALUES ($1,$2,'microsoft',$3,$4,NOW(),NOW())
     ON CONFLICT (organization_id,user_id,provider)
     DO UPDATE SET refresh_token_enc=EXCLUDED.refresh_token_enc,
                   scopes=EXCLUDED.scopes,
                   updated_at=NOW()`,
    [orgId, userId, encryptSecret(tokenResponse.refresh_token), tokenResponse.scope || ""]
  );
}

export async function graphAccessToken(orgId, userId) {
  const row = await q(
    `SELECT refresh_token_enc FROM integration_accounts
     WHERE organization_id=$1 AND user_id=$2 AND provider='microsoft'`,
    [orgId, userId]
  );
  if (!row.rows[0]) throw new Error("OUTLOOK_NOT_CONNECTED");

  const tenant = process.env.MICROSOFT_TENANT_ID || "organizations";
  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: decryptSecret(row.rows[0].refresh_token_enc),
    grant_type: "refresh_token",
    scope: "openid profile email offline_access User.Read Mail.Read"
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || "Não foi possível renovar o token Microsoft.");
  if (json.refresh_token) {
    await q(
      `UPDATE integration_accounts SET refresh_token_enc=$1,updated_at=NOW()
       WHERE organization_id=$2 AND user_id=$3 AND provider='microsoft'`,
      [encryptSecret(json.refresh_token), orgId, userId]
    );
  }
  return json.access_token;
}

export async function graphGet(accessToken, path) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Erro Microsoft Graph.");
  return json;
}
