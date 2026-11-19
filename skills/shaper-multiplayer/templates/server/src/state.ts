// State projection sketch. Keep only fields clients need to render or decide.

export type ExampleState = {
  phase: "lobby" | "active" | "finished";
  serverTick: number;
  players: Array<{
    id: string;
    displayName: string;
    ready: boolean;
    score: number;
  }>;
};

export function projectState(domainState: {
  phase: ExampleState["phase"];
  serverTick: number;
  players: Array<{ id: string; displayName: string; ready: boolean; score: number }>;
}): ExampleState {
  return {
    phase: domainState.phase,
    serverTick: domainState.serverTick,
    players: domainState.players.map((player) => ({ ...player })),
  };
}
