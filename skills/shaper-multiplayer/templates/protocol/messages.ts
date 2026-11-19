export type CommandId = string;

export type ReadyCommand = {
  type: "ready";
  commandId: CommandId;
};

export type InputCommand = {
  type: "input";
  commandId: CommandId;
  sequence: number;
  payload: {
    x: number;
    y: number;
  };
};

export type RoomCommand = ReadyCommand | InputCommand;

export type RoomErrorCode =
  | "INVALID_PAYLOAD"
  | "NOT_ADMITTED"
  | "WRONG_PHASE"
  | "DUPLICATE_COMMAND"
  | "RATE_LIMITED";

export function isRoomCommand(value: unknown): value is RoomCommand {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; commandId?: unknown };
  return (
    (candidate.type === "ready" || candidate.type === "input") &&
    typeof candidate.commandId === "string" &&
    candidate.commandId.length > 0 &&
    candidate.commandId.length <= 100
  );
}
