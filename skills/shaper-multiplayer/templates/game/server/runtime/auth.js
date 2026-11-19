import { verifyGameToken } from "./game-auth.js";
const GAME_APP_ID = process.env.GAME_APP_ID ?? "";
const GAME_TOKEN_PUBLIC_KEY_B64 = process.env.GAME_TOKEN_PUBLIC_KEY_B64 ?? "";

export function verifyTokenOrThrow(token) {
  const publicKey = Buffer.from(GAME_TOKEN_PUBLIC_KEY_B64, "base64").toString("utf8");
  return verifyGameToken(token, { appId: GAME_APP_ID, publicKey });
}

