import { z } from "zod";
export const AFFINITY_HEADER = "X-Cloudbase-Session-Id";
export const AFFINITY_QUERY = "cloudbase_session_id";
export const AffinitySchema = z.string().min(1).max(256).regex(/^[^\s\x00-\x1f\x7f]+$/);
export const SeatReservationSchema = z.object({
  name: z.string().min(1), sessionId: z.string().min(1), roomId: z.string().min(1),
  publicAddress: z.string().min(1).optional(), processId: z.string().min(1).optional(),
  reconnectionToken: z.string().min(1).optional(), devMode: z.boolean().optional(),
}).strict();
export class MultiplayerError extends Error {}
