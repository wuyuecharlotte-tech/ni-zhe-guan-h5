import { matchMaker } from "@colyseus/core";
import { AffinitySchema, MultiplayerError, SeatReservationSchema, } from "./protocol.js";
/**
 * `onCreate` option key carrying the CloudBase affinity token. The admission
 * helper writes it and the room reads it, so both sides share this constant
 * instead of repeating the string.
 */
export const AFFINITY_OPTION_KEY = "cloudbaseSessionId";
/** Room metadata key the affinity token is stored under. */
export const AFFINITY_METADATA_KEY = "cloudbaseSessionId";
/**
 * Extract the affinity token a room was created with.
 *
 * `Room.onCreate` / `onJoin` receive the merged join options, so a room only
 * needs to call this and spread the result into `setMetadata` (0.18 replaces
 * metadata wholesale, it does not merge).
 */
export function affinityFromOptions(options) {
    if (!options || typeof options !== "object")
        return undefined;
    const value = options[AFFINITY_OPTION_KEY];
    if (typeof value !== "string")
        return undefined;
    return AffinitySchema.safeParse(value).success ? value : undefined;
}
/**
 * Server-side admission: pick or create a room with the native matchmaker,
 * reserve a seat, then read back the room's affinity token.
 *
 * The affinity token is returned to the client so it can pin its WebSocket
 * upgrade to the instance that actually holds the room. Two outcomes are both
 * correct: joining a room on another instance yields that room's token, while a
 * locally created room yields the requester's own token (creation is forced
 * local by `selectProcessIdToCreateRoom`).
 */
export async function admitClient(request) {
    const roomType = request.roomType?.trim();
    if (!roomType) {
        return { ok: false, status: 400, code: "AFFINITY_REQUIRED", message: "缺少房间类型" };
    }
    if (typeof request.affinity !== "string" || request.affinity === "") {
        return {
            ok: false,
            status: 400,
            code: "AFFINITY_REQUIRED",
            message: "准入请求必须携带 cloudbase_session_id",
        };
    }
    if (!AffinitySchema.safeParse(request.affinity).success) {
        return { ok: false, status: 400, code: "AFFINITY_REQUIRED", message: "cloudbase_session_id 不合法" };
    }
    let reservation;
    try {
        const authContext = request.token === undefined ? undefined : {
            token: request.token,
            ip: undefined,
            headers: new Headers(),
        };
        const result = await matchMaker.joinOrCreate(roomType, {
            ...(request.options ?? {}),
            [AFFINITY_OPTION_KEY]: request.affinity,
        }, authContext);
        const parsed = SeatReservationSchema.safeParse(result);
        if (!parsed.success) {
            return { ok: false, status: 500, code: "ADMISSION_FAILED", message: "座位预约形状不合法" };
        }
        reservation = parsed.data;
    }
    catch (error) {
        return {
            ok: false,
            status: 503,
            code: "ADMISSION_FAILED",
            message: error instanceof MultiplayerError ? error.message : "匹配失败，请重试",
        };
    }
    let room;
    try {
        room = await matchMaker.getRoomById(reservation.roomId);
    }
    catch {
        return { ok: false, status: 503, code: "ADMISSION_FAILED", message: "读取房间信息失败，请重试" };
    }
    const affinity = room?.metadata?.[AFFINITY_METADATA_KEY];
    if (typeof affinity !== "string" || !AffinitySchema.safeParse(affinity).success) {
        return {
            ok: false,
            status: 409,
            code: "ROOM_AFFINITY_MISSING",
            message: "房间未记录亲和标识，拒绝准入",
        };
    }
    return { ok: true, reservation, affinity };
}
