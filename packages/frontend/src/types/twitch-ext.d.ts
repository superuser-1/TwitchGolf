/** Minimal typings for the Twitch Extension Helper (`window.Twitch.ext`). */
interface TwitchAuth {
  token: string;
  userId: string;
  channelId: string;
  clientId: string;
}

interface TwitchViewer {
  id: string | null;
  role: string;
  isLinked: boolean;
}

type TwitchPubSubListener = (target: string, contentType: string, message: string) => void;

interface TwitchExt {
  onAuthorized(cb: (auth: TwitchAuth) => void): void;
  listen(topic: string, cb: TwitchPubSubListener): void;
  unlisten(topic: string, cb: TwitchPubSubListener): void;
  viewer?: TwitchViewer;
  actions?: { requestIdShare(): void };
}

interface Window {
  Twitch?: { ext: TwitchExt };
}
