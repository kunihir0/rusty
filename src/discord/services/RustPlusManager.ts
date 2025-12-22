import { RustPlus } from "../../rustplus/ws";
import { appState } from "../../state/AppState";
import { AppMessage } from "../../gen/rustplus_pb";
import { onRustMessage } from "./TeamChatBridge";

let rustPlus: RustPlus | null = null;
let currentServerId: string | null = null;

export function getRustPlus() {
    return rustPlus;
}

export function getCurrentServerId() {
    return currentServerId;
}

export async function connectToRustServer(serverId: string) {
    const server = appState.fcmHandler?.state.serverList[serverId];
    if (!server) throw new Error("Server not found");

    if (rustPlus) {
        rustPlus.disconnect();
    }

    currentServerId = serverId;
    rustPlus = new RustPlus(server.serverIp, server.appPort, server.steamId, server.playerToken);
    
    rustPlus.on('connected', () => console.log(`[RustPlus] Connected to ${server.title}`));
    rustPlus.on('error', (e) => console.error(`[RustPlus] Error:`, e));
    
    // Bind Team Chat Listener
    rustPlus.on('message', (msg: AppMessage) => {
        onRustMessage(msg, serverId);
    });

    rustPlus.connect();
    
    // Sync with legacy appState for compatibility
    appState.rustPlus = rustPlus;
    
    return rustPlus;
}

export function disconnect() {
    if (rustPlus) rustPlus.disconnect();
    rustPlus = null;
    currentServerId = null;
    appState.rustPlus = undefined;
}
