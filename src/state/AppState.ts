import { RustPlus } from "../rustplus/ws";
import { createFcmHandler } from "../rustplus/fcmHandler";
import { TextChannel } from "discord.js";
import { MapGenerator } from "../rustplus/services/MapGenerator";
import { TeamTracker } from "../rustplus/services/TeamTracker";
import { VendingMachineService } from "../rustplus/services/VendingMachineService";

import { ConfigurationService } from "../discord/services/ConfigurationService";

// Shared mutable state
export const appState: {
    rustPlus?: RustPlus | undefined;
    fcmHandler?: ReturnType<typeof createFcmHandler> | undefined;
    pairingChannels: Map<string, TextChannel>;
    configService?: ConfigurationService | undefined;

    // Active Server Services
    mapSize?: number | undefined;
    mapGenerator?: MapGenerator | undefined;
    teamTracker?: TeamTracker | undefined;
    vendingMachineService?: VendingMachineService | undefined;
} = {
    pairingChannels: new Map<string, TextChannel>()
};
