// Thin client for the OHADA FinanceOS JSON API (same origin in production,
// proxied to :3050 in dev). Holds the bearer token + active organization.
const TOKEN_KEY = "ohada-token";
const ORG_KEY = "ohada-org";

let authToken = localStorage.getItem(TOKEN_KEY) || "";
let activeOrg = localStorage.getItem(ORG_KEY) || "";

export function getToken() {
  return authToken;
}

export function setAuth(token, organizationId) {
  authToken = token || "";
  if (authToken) localStorage.setItem(TOKEN_KEY, authToken);
  else localStorage.removeItem(TOKEN_KEY);
  setActiveOrg(organizationId);
}

export function setActiveOrg(organizationId) {
  activeOrg = organizationId || "";
  if (activeOrg) localStorage.setItem(ORG_KEY, activeOrg);
  else localStorage.removeItem(ORG_KEY);
}

export function clearAuth() {
  setAuth("", "");
}

export async function apiText(path) {
  const headers = {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  if (activeOrg) headers["x-organization-id"] = activeOrg;
  const response = await fetch(path, { headers });
  if (!response.ok) throw new Error(`Erreur ${response.status}`);
  return response.text();
}

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["content-type"] = "application/json";
  if (authToken) finalHeaders.authorization = `Bearer ${authToken}`;
  if (activeOrg) finalHeaders["x-organization-id"] = activeOrg;

  const response = await fetch(path, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload?.errors?.join(" ") || payload?.error || `Erreur ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
