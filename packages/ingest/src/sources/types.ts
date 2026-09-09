export interface ChatMessage {
  channelId: string;
  userId: string;
  login: string;
  displayName: string;
  text: string;
  isMod?: boolean;
  isBroadcaster?: boolean;
}

export interface ChatSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: ChatMessage) => void): void;
}
