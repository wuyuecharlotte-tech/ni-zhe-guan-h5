import { createPublicKey, verify } from "node:crypto";
export class GameAuthError extends Error {
    constructor() {
        super("Invalid game token");
        this.name = "GameAuthError";
    }
}
export function verifyGameToken(token, options) {
    if (typeof token !== "string" || !token || token.length > 8192 || !options.publicKey || !/^app_[a-zA-Z0-9]+$/.test(options.appId)) {
        throw new GameAuthError();
    }
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)))
        throw new GameAuthError();
    try {
        const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
        if (!isRecord(header) || header.alg !== "RS256" || (header.typ !== undefined && header.typ !== "JWT"))
            throw new GameAuthError();
        const key = createPublicKey(options.publicKey);
        if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
            throw new GameAuthError();
        const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
        if (!verify("RSA-SHA256", signed, key, Buffer.from(parts[2], "base64url")))
            throw new GameAuthError();
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (!isRecord(payload))
            throw new GameAuthError();
        const now = options.now ?? Math.floor(Date.now() / 1000);
        if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128 ||
            payload.appId !== options.appId || !Number.isInteger(payload.exp) ||
            payload.exp <= now)
            throw new GameAuthError();
        // iss/aud/iat are optional compatibility claims in一期. If an issuer sends
        // aud or iat, keep the stricter checks; absence remains valid.
        if (payload.aud !== undefined) {
            const aud = payload.aud;
            const matches = typeof aud === "string" ? aud === options.appId :
                Array.isArray(aud) && aud.every((item) => typeof item === "string") && aud.includes(options.appId);
            if (!matches)
                throw new GameAuthError();
        }
        if (payload.iat !== undefined &&
            (!Number.isInteger(payload.iat) || payload.iat > now + 30 || payload.exp <= payload.iat)) {
            throw new GameAuthError();
        }
        const principal = {
            sub: payload.sub,
            appId: payload.appId,
            exp: payload.exp,
            ...(typeof payload.iss === "string" ? { iss: payload.iss } : {}),
            ...(typeof payload.aud === "string" || Array.isArray(payload.aud) ? { aud: payload.aud } : {}),
            ...(typeof payload.iat === "number" ? { iat: payload.iat } : {}),
        };
        return principal;
    }
    catch {
        throw new GameAuthError();
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
