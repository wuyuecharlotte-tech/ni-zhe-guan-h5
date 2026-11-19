// Boundary sketch. Verify exact Room, client, Schema, and handler APIs against
// the upstream Colyseus v0.18.0 skill before compiling. `this.allowReconnection`
// below is inherited from the upstream `Room` base class; this file is an
// adapter sketch, not compilable on its own.

import { verifyGameToken } from "@shaper/multiplayer-server";

/**
 * Grace period for a dropped player. Pick the number from the decision table in
 * `references/reconnection.md` §3.3 (turn-based/co-op can afford a whole turn,
 * arena wants 5-15s, disposable party rooms want 0-5s). Keep it in one place so
 * it never leaks out as an inline magic number.
 */
const RECONNECT_GRACE_SECONDS = 10;

type RoomContext = {
  clock: { now(): number };
  domain: {
    accept(command: unknown, playerId: string): { ok: true; state: unknown } | { ok: false; code: string };
    /** Projection only: the seat stays, but the player is flagged as absent. */
    markDisconnected(playerId: string): void;
    markReconnected(playerId: string): void;
    /** Grace period expired: settle by the chosen policy (forfeit, spectate, ...). */
    forfeit(playerId: string): void;
    /** Idempotent seat release. Called for consented leave and after a drop. */
    release(playerId: string, code: number): void;
  };
};

export class ExampleRoom {
  private context!: RoomContext;

  static onAuth(token: string | undefined) {
    return verifyGameToken(token, {
      appId: process.env.GAME_APP_ID ?? "",
      publicKey: Buffer.from(process.env.GAME_TOKEN_PUBLIC_KEY_B64 ?? "", "base64").toString("utf8"),
    });
  }

  onCreate(options: unknown) {
    this.context = createContext(options);
    // Register the room state and inbound game-specific protocol handlers here.
    // Keep handlers thin: decode, validate transport metadata, call domain.
  }

  onJoin(client: { sessionId: string; auth: { sub: string } }, options: unknown) {
    // Admission is based on the verified principal returned by onAuth.
    void client;
    void options;
  }

  onMessage(client: { auth: { sub: string } }, message: unknown) {
    const result = this.context.domain.accept(message, client.auth.sub);
    if (!result.ok) {
      // Send a stable error code through the upstream-supported response path.
      return { error: result.code };
    }
    return result.state;
  }

  /**
   * Non-voluntary close. Do not delete the seat here: within the grace period
   * the player can still come back, and Colyseus calls `onLeave` again once the
   * grace period expires without a reconnect (see `references/reconnection.md` §3.1).
   */
  onDrop(client: { sessionId: string }, code: number) {
    this.context.domain.markDisconnected(client.sessionId);
    void code;
    void this.allowReconnection(client, RECONNECT_GRACE_SECONDS).then(
      () => {}, // recovery is handled in onReconnect
      () => this.context.domain.forfeit(client.sessionId), // grace expired -> settle by policy
    );
  }

  /** The seat survived; restore the player and let the projection flip back. */
  onReconnect(client: { sessionId: string }) {
    this.context.domain.markReconnected(client.sessionId);
  }

  /**
   * Reached for a consented leave (4000), a second time after every drop, and
   * when a reconnect handshake fails (4003). Must be idempotent: release the
   * seat, drop buffered input, and stop only this player's timers.
   */
  onLeave(client: { sessionId: string }, code: number) {
    this.context.domain.release(client.sessionId, code);
  }

  onDispose() {
    // Stop timers, detach listeners, and flush only bounded explicit effects.
  }
}

function createContext(options: unknown): RoomContext {
  void options;
  throw new Error("Wire the domain service and clock here");
}
