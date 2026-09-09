/**
 * Minimal ambient shim for tmi.js (which ships no types). Only the surface we
 * use is declared.
 */
declare module "tmi.js" {
  export interface ChatUserstate {
    "user-id"?: string;
    "room-id"?: string;
    username?: string;
    "display-name"?: string;
    "message-type"?: string;
    mod?: boolean;
    badges?: { broadcaster?: string; moderator?: string } | null;
  }

  export interface Options {
    options?: { skipUpdatingEmotesets?: boolean; debug?: boolean };
    connection?: {
      reconnect?: boolean;
      secure?: boolean;
      maxReconnectAttempts?: number;
      reconnectInterval?: number;
    };
    channels?: string[];
  }

  export type MessageListener = (
    channel: string,
    tags: ChatUserstate,
    message: string,
    self: boolean,
  ) => void;

  export class Client {
    constructor(opts?: Options);
    connect(): Promise<[string, number]>;
    disconnect(): Promise<[string, number]>;
    on(event: "message", listener: MessageListener): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  const tmi: { Client: typeof Client };
  export default tmi;
}
