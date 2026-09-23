// CineForge AI — client-side account system
// Email/password accounts (PBKDF2-hashed, salted) + Google connect.
// Works entirely in the browser (no backend DB needed) so the app is FREE
// forever with zero infrastructure. Accounts, chats, memory persist per browser.

const ACCOUNTS_KEY = "cf_accounts_v1";
const SESSION_KEY = "cf_session_v1";

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function isBrowser() {
  return typeof window !== "undefined";
}

export function loadAccounts() {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAccounts(acc) {
  if (!isBrowser()) return;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(acc));
}

async function pbkdf2(password, saltHex, iterations = 120000) {
  const enc = new TextEncoder();
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function randomHex(len = 16) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function register({ email, name, password }) {
  await delay(150);
  const acc = loadAccounts();
  const key = email.toLowerCase();
  if (acc[key]) throw new Error("An account with this email already exists. Try logging in.");
  const salt = randomHex(16);
  const hash = await pbkdf2(password, salt);
  acc[key] = { email: email.toLowerCase(), name: name || email.split("@")[0], hash, salt, provider: "email", picture: "", createdAt: Date.now() };
  saveAccounts(acc);
  return login({ email, password });
}

export async function login({ email, password }) {
  await delay(150);
  const acc = loadAccounts();
  const key = email.toLowerCase();
  const acct = acc[key];
  if (!acct) throw new Error("No account found with this email. Create one first.");
  if (acct.provider === "google") throw new Error("This email is connected via Google. Use 'Continue with Google'.");
  const hash = await pbkdf2(password, acct.salt);
  if (hash !== acct.hash) throw new Error("Incorrect password. Try again.");
  const session = { email: acct.email, name: acct.name, picture: acct.picture || "", provider: acct.provider, ts: Date.now() };
  if (isBrowser()) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

// Google connect. Real GIS flow supplies {email,name,picture}; demo mode builds it.
export function linkGoogle(profile) {
  const acc = loadAccounts();
  const key = (profile.email || "").toLowerCase();
  const now = Date.now();
  const acct = acc[key] || { email: key, name: profile.name || key.split("@")[0], picture: profile.picture || "", provider: "google", createdAt: now };
  acct.picture = profile.picture || acct.picture || "";
  acct.name = profile.name || acct.name;
  acct.provider = "google";
  acct.googleLinkedAt = acct.googleLinkedAt || now;
  acc[key] = acct;
  saveAccounts(acc);
  const session = { email: acct.email, name: acct.name, picture: acct.picture, provider: "google", ts: now };
  if (isBrowser()) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession() {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function logout() {
  if (isBrowser()) localStorage.removeItem(SESSION_KEY);
}

export function guestSession() {
  const s = { email: "guest", name: "Guest", picture: "", provider: "guest", ts: Date.now() };
  if (isBrowser()) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  return s;
}

export async function changePassword(email, oldPw, newPw) {
  const acc = loadAccounts();
  const key = email.toLowerCase();
  const acct = acc[key];
  if (!acct) throw new Error("Account not found");
  const check = await pbkdf2(oldPw, acct.salt);
  if (check !== acct.hash) throw new Error("Current password is incorrect");
  const salt = randomHex(16);
  acct.hash = await pbkdf2(newPw, salt);
  acct.salt = salt;
  saveAccounts(acc);
  return true;
}

export function getProviderInfo() {
  return {
    googleClientId: (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) || "",
  };
}