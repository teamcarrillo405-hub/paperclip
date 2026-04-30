import { scryptAsync } from "file:///C:/Users/glcar/paperclip/node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/scrypt.js";
import postgres from "file:///C:/Users/glcar/paperclip/node_modules/.pnpm/postgres@3.4.8/node_modules/postgres/src/index.js";

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

const password = "Avero2026!";
const saltBytes = crypto.getRandomValues(new Uint8Array(16));
const salt = toHex(saltBytes);
const key = await scryptAsync(password.normalize("NFKC"), salt, {
  N: 16384, r: 16, p: 1, dkLen: 64, maxmem: 128 * 16384 * 16 * 2,
});
const hash = `${salt}:${toHex(key)}`;

const sql = postgres("postgresql://paperclip:paperclip@127.0.0.1:54329/paperclip");

// Delete local@paperclip.local user and all related data (cascade)
const deleted = await sql`
  DELETE FROM "user"
  WHERE email = 'local@paperclip.local'
  RETURNING id, email
`;
console.log(deleted.length > 0
  ? `Deleted: ${deleted.map(u => u.email).join(", ")}`
  : "local@paperclip.local not found (already removed)"
);

const remaining = await sql`SELECT email FROM "user"`;
console.log("Remaining users:", remaining.map(u => u.email).join(", ") || "(none)");
await sql.end();
