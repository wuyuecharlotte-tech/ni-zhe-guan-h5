import { Room, ServerError } from "@colyseus/core";
import { schema, t } from "@colyseus/schema";
import { AFFINITY_METADATA_KEY, affinityFromOptions } from "../runtime/admission.js";
import { verifyTokenOrThrow } from "../runtime/auth.js";

const PlayerState = schema({ name: t.string() }, "CountPlayer");
const CountState = schema(
  { count: t.number().default(0), version: t.string(), players: t.map(PlayerState) },
  "CountState",
);

export class CountRoom extends Room {
  maxClients = 8;
  state = new CountState();

  /** 平台在部署时注入 GAME_APP_ID 与公钥；客户端传来的任何身份字段一律不信任。 */
  static async onAuth(token) {
    try {
      return verifyTokenOrThrow(typeof token === "string" ? token : undefined);
    } catch {
      throw new ServerError(401, "Invalid game token");
    }
  }

  async onCreate(options = {}) {
    const affinity = affinityFromOptions(options);
    if (affinity) await this.setMetadata({ ...this.metadata, [AFFINITY_METADATA_KEY]: affinity });
    this.state.version = "v1-count";
    this.state.count = 0;
    this.onMessage("increment", (client) => {
      const sub = client.auth?.sub;
      if (typeof sub !== "string" || sub.length === 0) return;
      this.state.count += 1;
    });
  }

  onJoin(client) {
    const player = new PlayerState();
    player.name = String(client.auth?.sub ?? client.sessionId);
    this.state.players.set(client.sessionId, player);
  }

  async onDrop(client) {
    try { await this.allowReconnection(client, 20); } catch { /* onLeave cleans up */ }
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
  }
}

