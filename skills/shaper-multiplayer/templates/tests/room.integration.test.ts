// Integration-test outline. Use the test client and exact lifecycle helpers
// from the upstream Colyseus v0.18.0 skill. The reconnect cases encode the
// contract fixed by `references/reconnection.md` §8.

describe("example room contract", () => {
  it("admits a compatible client and exposes the initial projection", async () => {
    const room = await connectTestClient({ protocolVersion: "current" });
    expect(room.state.phase).toBe("lobby");
  });

  it("rejects an invalid command without mutating state", async () => {
    const room = await connectTestClient({ protocolVersion: "current" });
    const before = snapshot(room.state);
    await room.send({ type: "input", commandId: "bad", sequence: -1, payload: { x: 999, y: 999 } });
    expect(snapshot(room.state)).toEqual(before);
  });

  it("does not apply a retried command twice", async () => {
    const room = await connectTestClient({ protocolVersion: "current" });
    const command = { type: "ready", commandId: "stable-command" };
    await room.send(command);
    const afterFirst = snapshot(room.state);
    await room.send(command);
    expect(snapshot(room.state)).toEqual(afterFirst);
  });

  it("keeps the seat across drop -> reconnect", async () => {
    const room = await connectTestClient({ protocolVersion: "current" });
    // Resume with the captured handle, never with the Colyseus sessionId:
    // sessionId is a per-player seat id, not a reconnection credential.
    // See references/reconnection.md §7.
    const handle = captureResumeHandle(room);
    const sessionId = room.sessionId;
    dropTransport(room); // no close code -> CloseCode.NO_STATUS_RECEIVED (1005)
    const resumed = await resumeTestClient(handle);
    expect(resumed.sessionId).toBe(sessionId);
    expect(resumed.roomId).toBe(handle.roomId);
    expect(resumed.state.phase).toBe(room.state.phase);
  });

  it("settles the seat when the reconnect grace period expires", async () => {
    // The client must stop auto-reconnecting here, otherwise the server sees a
    // reconnect instead of a grace-period expiry. The room's grace period is
    // shortened to seconds by the test fixture.
    const room = await connectTestClient({ protocolVersion: "current", reconnection: { enabled: false } });
    const sessionId = room.sessionId;
    dropTransport(room);
    const events = await waitForServerLeave(sessionId);
    // Grace-period expiry reuses the original drop code; onLeave is called a
    // second time on the drop path (references/reconnection.md §3.1-3.2).
    expect(events).toEqual([
      { type: "drop", sessionId, code: 1005 },
      { type: "leave", sessionId, code: 1005 },
    ]);
    expect(await seatOf(sessionId)).toBeUndefined();
  });

  it("does not allow reconnection after a consented leave", async () => {
    const room = await connectTestClient({ protocolVersion: "current" });
    const sessionId = room.sessionId;
    await room.leave(true); // CloseCode.CONSENTED (4000)
    // Consented leave goes straight to onLeave: no drop, no grace period.
    expect(await serverEventsFor(sessionId)).toEqual([{ type: "leave", sessionId, code: 4000 }]);
    expect(await seatOf(sessionId)).toBeUndefined();
  });

  it("fails closed on an expired resume handle", async () => {
    const handle = expiredResumeHandle();
    // An expired or released handle must clear the store and surface a stable
    // error instead of silently falling back to a fresh bootstrap.
    await expect(resumeFromTestClient(handle)).rejects.toMatchObject({ code: "INVALID_RESUME" });
    expect(readTestStore()).toBeUndefined();
  });

  it("cleans up timers and external effects on disposal", async () => {
    const room = await connectTestClient({ protocolVersion: "current" });
    await room.dispose();
    expect(room.openTimers()).toHaveLength(0);
  });
});

function snapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

declare function connectTestClient(options: { protocolVersion: string; reconnection?: { enabled: boolean } }): Promise<any>;
declare function captureResumeHandle(room: any): { roomId: string; token: string };
declare function dropTransport(room: any): void;
declare function resumeTestClient(handle: { roomId: string; token: string }): Promise<any>;
declare function resumeFromTestClient(handle: unknown): Promise<any>;
declare function expiredResumeHandle(): unknown;
declare function readTestStore(): unknown;
declare function waitForServerLeave(sessionId: string): Promise<Array<{ type: string; sessionId: string; code: number }>>;
declare function serverEventsFor(sessionId: string): Promise<Array<{ type: string; sessionId: string; code: number }>>;
declare function seatOf(sessionId: string): Promise<unknown>;
