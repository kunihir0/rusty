import { RustPlus } from "../../rustplus/ws";
import { appState } from "../../state/AppState";
import { AppMessage } from "../../gen/rustplus_pb";
import { onRustMessage } from "./TeamChatBridge";
import { TeamTracker } from "../../rustplus/services/TeamTracker";
import { MapGenerator } from "../../rustplus/services/MapGenerator";
import { VendingMachineService } from "../../rustplus/services/VendingMachineService";
import { EmbedBuilder, Colors } from "discord.js";

let rustPlus: RustPlus | null = null;
let currentServerId: string | null = null;
let pollingInterval: NodeJS.Timer | null = null;

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
    
    rustPlus.on('connected', async () => {
        console.log(`[RustPlus] Connected to ${server.title}`);

        try {
            // 1. Get Basic Info
            const infoRes = await rustPlus!.sendRequestAsync({ getInfo: {} });
            const mapSize = infoRes.info?.mapSize || 4500;

            // 2. Initialize Services
            appState.teamTracker = new TeamTracker(mapSize);
            appState.vendingMachineService = new VendingMachineService();
            
            // Map Generator needs oceanMargin from Map Data
            const mapRes = await rustPlus!.sendRequestAsync({ getMap: {} });
            if (mapRes.map) {
                 const oceanMargin = mapRes.map.oceanMargin;
                 appState.mapGenerator = new MapGenerator(mapSize, oceanMargin);
            }

            // 3. Initial Vending Machine Update
            const markersRes = await rustPlus!.sendRequestAsync({ getMapMarkers: {} });
            if (markersRes.mapMarkers) {
                appState.vendingMachineService.updateVendingMachines(markersRes.mapMarkers.markers);
            }

            // 4. Initial Team State
            const teamRes = await rustPlus!.sendRequestAsync({ getTeamInfo: {} });
            if (teamRes.teamInfo) {
                appState.teamTracker.processTeamUpdate(teamRes.teamInfo);
            }

            // 5. Start Polling (Fallback/Reliability)
            if (pollingInterval) clearInterval(pollingInterval);
            pollingInterval = setInterval(async () => {
                if (!rustPlus || !rustPlus.isConnected()) return;
                try {
                    const polledTeam = await rustPlus.sendRequestAsync({ getTeamInfo: {} }, 2000); // 2s timeout
                    if (polledTeam.teamInfo && appState.teamTracker) {
                        const deaths = appState.teamTracker.processTeamUpdate(polledTeam.teamInfo);
                        handleDeathEvents(deaths, server.title);
                    }
                } catch (e) {
                    // Ignore timeouts/errors in polling to avoid spam
                }
            }, 5000); // Poll every 5 seconds

            console.log("[RustPlus] Services Initialized");

        } catch (e) {
            console.error("[RustPlus] Failed to initialize services:", e);
        }
    });

    rustPlus.on('error', (e) => console.error(`[RustPlus] Error:`, e));
    
    // Bind Team Chat Listener & Tracker
    rustPlus.on('message', async (msg: AppMessage) => {
        // Debug Log
        if (msg.broadcast) {
             console.log("[RustPlus] Received Broadcast:", JSON.stringify(msg.broadcast, (key, value) => 
                key === 'jpgImage' ? '[Buffer]' : value
             ));
        }

        try {
            onRustMessage(msg, serverId);
        } catch (e) {
            console.error("Error in onRustMessage:", e);
        }

        // Team Tracker (Broadcast)
        if (msg.broadcast && msg.broadcast.teamChanged && msg.broadcast.teamChanged.teamInfo && appState.teamTracker) {
            const deaths = appState.teamTracker.processTeamUpdate(msg.broadcast.teamChanged.teamInfo);
            handleDeathEvents(deaths, server.title);
        }
    });

    rustPlus.connect();
    
    // Sync with legacy appState for compatibility
    appState.rustPlus = rustPlus;
    
    return rustPlus;
}

async function handleDeathEvents(deaths: any[], serverTitle: string) {
    if (deaths.length === 0) return;

    const threadName = `${serverTitle} - Team Chat`;
                
    for (const channel of appState.pairingChannels.values()) {
        let target: any = channel.threads.cache.find(t => t.name === threadName);
        
        if (!target) {
            try {
                    const fetched = await channel.threads.fetch();
                    target = fetched.threads.find(t => t.name === threadName);
                    
                    if (!target) {
                    target = await channel.threads.create({
                        name: threadName,
                        autoArchiveDuration: 10080,
                        reason: 'Team Chat & Events'
                    });
                    }
            } catch (e) {
                console.error("Failed to find/create Team Chat thread:", e);
                continue;
            }
        }
        
        if (target) {
            for (const death of deaths) {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setAuthor({ name: death.name, iconURL: 'https://i.imgur.com/8j9z3fE.png' })
                    .setDescription(`**Died at ${death.grid || 'Unknown'}**`)
                    .setTimestamp(death.deathTime > 0 ? death.deathTime * 1000 : Date.now());
                
                await target.send({ embeds: [embed] });
            }
        }
    }
}

export function disconnect() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    if (rustPlus) rustPlus.disconnect();
    rustPlus = null;
    currentServerId = null;
    appState.rustPlus = undefined;
    appState.teamTracker = undefined;
    appState.mapGenerator = undefined;
    appState.vendingMachineService = undefined;
}