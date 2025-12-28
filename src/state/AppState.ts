import { RustPlus } from "../rustplus/ws";
import { createFcmHandler } from "../rustplus/fcmHandler";
import { TextChannel } from "discord.js";
import { MapGenerator } from "../rustplus/services/MapGenerator";
import { TeamTracker } from "../rustplus/services/TeamTracker";
import { VendingMachineService } from "../rustplus/services/VendingMachineService";

// Shared mutable state
export const appState: {
    rustPlus?: RustPlus;
    fcmHandler?: ReturnType<typeof createFcmHandler>;
    pairingChannels: Map<string, TextChannel>;
    
    // Active Server Services
    mapGenerator?: MapGenerator;
    teamTracker?: TeamTracker;
    vendingMachineService?: VendingMachineService;
} = {
    pairingChannels: new Map<string, TextChannel>()
};
