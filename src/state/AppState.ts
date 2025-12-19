import { RustPlus } from "../rustplus/ws";
import { createFcmHandler } from "../rustplus/fcmHandler";
import { TextChannel } from "discord.js";

// Shared mutable state
export const appState: {
    rustPlus?: RustPlus;
    fcmHandler?: ReturnType<typeof createFcmHandler>;
    pairingChannels: Map<string, TextChannel>;
} = {
    pairingChannels: new Map<string, TextChannel>()
};
