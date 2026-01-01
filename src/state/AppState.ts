import { RustPlus } from "../rustplus/ws";
import { createFcmHandler } from "../rustplus/fcmHandler";
import { TextChannel } from "discord.js";
import { MapGenerator } from "../rustplus/services/MapGenerator";
import { TeamTracker } from "../rustplus/services/TeamTracker";
import { VendingMachineService } from "../rustplus/services/VendingMachineService";

import { ConfigurationService } from "../discord/services/ConfigurationService";

// Shared mutable state
export const appState: {
    rustPlus?: RustPlus;
    fcmHandler?: ReturnType<typeof createFcmHandler>;
    pairingChannels: Map<string, TextChannel>;
    configService?: ConfigurationService;
    
    // Active Server Services
    mapGenerator?: MapGenerator;
    teamTracker?: TeamTracker;
    vendingMachineService?: VendingMachineService;
    mapSize?: number;
} = {
    pairingChannels: new Map<string, TextChannel>()
};
