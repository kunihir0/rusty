import { createBattlemetricsClient, BattlemetricsClient } from "../../rustplus/services/battlemetrics";
import { appState } from "../../state/AppState";
import { EmbedBuilder, Colors, TextChannel, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { TeamDetectorService } from "./TeamDetectorService";
import { JsonPersistenceManager } from "../../rustplus/PersistenceManager";
import { SteamService } from "../../rustplus/services/SteamService";
import { getRustPlus } from "./RustPlusManager";
import path from "path";

const clients = new Map<string, BattlemetricsClient>();
const teamDetector = new TeamDetectorService();
const steamService = new SteamService();

export function getBattleMetricsClient(serverId: string): BattlemetricsClient | undefined {
    return clients.get(serverId);
}

export function generateBattleMetricsEmbed(client: BattlemetricsClient): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(client.name || "Unknown Server")
        .setURL(`https://www.battlemetrics.com/servers/rust/${client.id}`)
        .setColor(client.server_status === 'online' ? Colors.Green : Colors.Red)
        .addFields(
            { name: 'Status', value: client.server_status || 'Unknown', inline: true },
            { name: 'Rank', value: `#${client.server_rank || 'N/A'}`, inline: true },
            { name: 'Players', value: `${client.server_players}/${client.server_maxPlayers}`, inline: true },
            { name: 'Country', value: client.server_country || 'N/A', inline: true },
            { name: 'FPS', value: client.server_rust_fps_avg ? client.server_rust_fps_avg.toFixed(0) : 'N/A', inline: true },
            { name: 'Entities', value: client.server_rust_ent_cnt_i ? client.server_rust_ent_cnt_i.toLocaleString() : 'N/A', inline: true },
            { name: 'Connect', value: `\`connect ${client.server_ip}:${client.server_port}\``, inline: false }
        )
        .setTimestamp();
    
    return embed;
}

interface WatchEntry {
    steamId: string;
    name: string; // Steam Name (used for matching)
    addedAt: number;
}

// Persistence Setup
const watchlistPath = path.join(process.cwd(), 'watchlist.json');
const persistence = new JsonPersistenceManager(watchlistPath);

// Initialize Watchlist
let saved = persistence.loadState();
if (!saved.players) saved = { players: {} };

// Migration: Check for old string format (Name -> SteamID)
const migratedPlayers: Record<string, WatchEntry> = {};
let migrationNeeded = false;

for (const [key, value] of Object.entries(saved.players)) {
    if (typeof value === 'string') {
        // Old format: key=Name, value=SteamID
        // New format: key=SteamID, value=WatchEntry
        migratedPlayers[value] = {
            steamId: value,
            name: key,
            addedAt: Date.now()
        };
        migrationNeeded = true;
    } else {
        // New format: key=SteamID, value=WatchEntry
        if (value && typeof value === 'object' && (value as any).steamId) {
             migratedPlayers[key] = value as WatchEntry;
        }
    }
}

if (migrationNeeded) {
    saved.players = migratedPlayers;
    persistence.saveState(saved);
    console.log("[Watchlist] Migrated legacy watchlist data to new format.");
}

// Key: Steam ID -> Entry
const watchedPlayers = new Map<string, WatchEntry>(Object.entries(saved.players));

// UI State
let dashboardMessageId: string | null = saved.dashboardMessageId || null;
let dashboardThreadId: string | null = saved.dashboardThreadId || null;

function saveWatchlist() {
    persistence.saveState({
        players: Object.fromEntries(watchedPlayers),
        dashboardMessageId,
        dashboardThreadId
    });
}

export function startBattlemetricsPolling() {
    console.log("Starting Battlemetrics Polling Service...");
    console.log(`Loaded ${watchedPlayers.size} players in watchlist.`);
    // Initial Dashboard Update
    updateWatchlistDashboard();
    
    runLoop();
    setInterval(runLoop, 60000);
}

export async function addToWatchList(inputSteamId: string): Promise<{ success: boolean, message: string }> {
    try {
        // 1. Resolve Steam Name
        let steamId = inputSteamId;
        // Basic cleanup if user pasted url
        if (steamId.includes('/profiles/')) {
            const match = steamId.match(/profiles\/(\d+)/);
            if (match) steamId = match[1];
        }
        
        const steamName = await steamService.getProfileName(steamId);
        if (!steamName || steamName === 'Unknown') {
            return { success: false, message: "Could not find Steam Profile." };
        }

        // 2. Add to Watchlist (Local Match Mode)
        const entry: WatchEntry = {
            steamId: steamId,
            name: steamName, 
            addedAt: Date.now()
        };

        watchedPlayers.set(entry.steamId, entry);
        saveWatchlist();
        updateWatchlistDashboard(); // Update UI

        console.log(`[Watchlist] Added ${entry.name} (${entry.steamId})`);
        return { success: true, message: `Added **${entry.name}** (${entry.steamId}) to watchlist.` };

    } catch (e: any) {
        console.error("Error adding to watchlist:", e);
        return { success: false, message: `Error: ${e.message}` };
    }
}

export function removeFromWatchList(nameOrId: string): boolean {
    // Allow removing by Name or Steam ID
    let foundKey: string | null = null;
    
    if (watchedPlayers.has(nameOrId)) {
        foundKey = nameOrId;
    } else {
        // Search by name
        for (const [key, entry] of watchedPlayers) {
            if (entry.name.toLowerCase() === nameOrId.toLowerCase()) {
                foundKey = key;
                break;
            }
        }
    }

    if (foundKey) {
        const entry = watchedPlayers.get(foundKey)!;
        watchedPlayers.delete(foundKey);
        saveWatchlist();
        updateWatchlistDashboard();
        console.log(`[Watchlist] Removed ${entry.name}`);
        return true;
    }
    return false;
}

export function clearWatchList(): void {
    watchedPlayers.clear();
    saveWatchlist();
    updateWatchlistDashboard();
    console.log(`[Watchlist] Cleared entire watchlist.`);
}

export function getWatchList(): Map<string, WatchEntry> {
    return watchedPlayers;
}

export function getWatchListStatus(): string {
    const online: string[] = [];
    const offline: string[] = [];

    // We check all clients to see who is online
    // A player is online if they are in ANY tracked server's onlinePlayers list
    
    for (const [steamId, entry] of watchedPlayers) {
        let isOnline = false;
        for (const client of clients.values()) {
            if (client.onlinePlayers.includes(steamId)) {
                isOnline = true;
                break;
            }
            // Fallback: Check by name if ID match fails (though ID match is better)
            // client.onlinePlayers is IDs. client.players[id].name is name.
        }

        if (isOnline) online.push(entry.name);
        else offline.push(entry.name);
    }

    if (watchedPlayers.size === 0) return "Watchlist empty.";

    const onlineStr = online.length > 0 ? `Online (${online.length}): ${online.join(', ')}` : "Online: 0";
    const offlineStr = `Offline: ${offline.length}`;
    
    return `[MSS Watchlist] ${onlineStr} | ${offlineStr}`;
}

export async function refreshDashboard() {
    console.log("[Watchlist] Manually refreshing dashboard...");
    // Try to delete old message if exists
    if (dashboardMessageId && dashboardThreadId) {
        try {
            const guildId = appState.pairingChannels.keys().next().value;
            if (guildId) {
                const channel = appState.pairingChannels.get(guildId);
                const thread = await channel?.threads.fetch(dashboardThreadId).catch(() => null);
                if (thread) {
                    const msg = await thread.messages.fetch(dashboardMessageId).catch(() => null);
                    if (msg) await msg.delete();
                }
            }
        } catch (e) {
            console.error("Error clearing old dashboard:", e);
        }
    }
    
    dashboardMessageId = null;
    // Force update will create new message since ID is null
    await updateWatchlistDashboard();
}

// --- Dashboard Logic ---
async function updateWatchlistDashboard() {
    // We need a channel. Use the first pairing channel found.
    const guildId = appState.pairingChannels.keys().next().value;
    if (!guildId) return;
    const channel = appState.pairingChannels.get(guildId);
    if (!channel) return;

    try {
        // 1. Ensure Thread
        let thread;
        if (dashboardThreadId) {
            thread = await channel.threads.fetch(dashboardThreadId).catch(() => null);
        }
        
        if (!thread) {
            // Find by name or create
            const fetched = await channel.threads.fetch();
            thread = fetched.threads.find(t => t.name === "MSS Watchlist");
            
            if (!thread) {
                thread = await channel.threads.create({
                    name: "MSS Watchlist",
                    autoArchiveDuration: 10080,
                    reason: "MSS Watchlist Dashboard"
                });
            }
            dashboardThreadId = thread.id;
            saveWatchlist();
        }

        // 2. Build Embed (Grouped)
        const embed = new EmbedBuilder()
            .setTitle("🛡️ MSS Watchlist Dashboard")
            .setColor(Colors.Blue)
            .setTimestamp()
            .setFooter({ text: `Tracking ${watchedPlayers.size} players` });

        const onlineLines: string[] = [];
        const offlineLines: string[] = [];
        const removeOptions: any[] = [];

        for (const [key, entry] of watchedPlayers) { // Key is SteamID
            let isOnline = false;
            let serverName = "";
            
            for (const client of clients.values()) {
                const onlineNames = client.onlinePlayers.map((id: string) => client.players[id]?.name);
                if (onlineNames.includes(entry.name)) {
                    isOnline = true;
                    serverName = client.name || "Unknown Server";
                    break;
                }
            }

            const timeAdded = `<t:${Math.floor(entry.addedAt / 1000)}:R>`;
            const line = `**[${entry.name}](https://steamcommunity.com/profiles/${entry.steamId})** • Added ${timeAdded}`;

            if (isOnline) {
                onlineLines.push(`🟢 ${line} @ **${serverName}**`);
            } else {
                offlineLines.push(`🔴 ${line}`);
            }

            // Populate Select Menu Options
            removeOptions.push({
                label: entry.name,
                description: `SteamID: ${entry.steamId}`,
                value: entry.steamId // Use SteamID as value for removal
            });
        }

        if (onlineLines.length > 0) embed.addFields({ name: `🟢 Online (${onlineLines.length})`, value: onlineLines.join('\n').substring(0, 1024) });
        if (offlineLines.length > 0) embed.addFields({ name: `🔴 Offline (${offlineLines.length})`, value: offlineLines.join('\n').substring(0, 1024) });
        if (watchedPlayers.size === 0) embed.setDescription("Watchlist is empty.");

        // 3. Build Components
        const components: any[] = [];
        
        // Row 1: Refresh Button
        const row1 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('watchlist-refresh')
                    .setLabel('Refresh Status')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
        components.push(row1);

        // Row 2: Remove Select Menu (if players exist)
        if (removeOptions.length > 0) {
            // Discord limits select options to 25.
            const slicedOptions = removeOptions.slice(0, 25);
            const row2 = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('watchlist-remove-menu')
                        .setPlaceholder('Select player to remove...')
                        .addOptions(slicedOptions)
                );
            components.push(row2);
        }

        // 4. Ensure Message
        if (dashboardMessageId) {
            try {
                const message = await thread.messages.fetch(dashboardMessageId);
                if (message) {
                    await message.edit({ embeds: [embed], components: components });
                    return;
                }
            } catch (e) {
                // Message lost
            }
        }

        // Create new message
        const message = await thread.send({ embeds: [embed], components: components });
        dashboardMessageId = message.id;
        saveWatchlist();

    } catch (e) {
        console.error("Failed to update Watchlist Dashboard:", e);
    }
}

async function updateServerEmbeds() {
    if (!appState.fcmHandler) return;

    for (const [serverId, server] of Object.entries(appState.fcmHandler.state.serverList)) {
        if (!server.discordThreadId || !server.battlemetricsMessageId || !server.battlemetricsId) continue;

        const client = clients.get(serverId);
        if (!client) continue;

        try {
            // Find thread
            // We iterate channels to find the thread
            for (const channel of appState.pairingChannels.values()) {
                try {
                    const thread = await channel.threads.fetch(server.discordThreadId).catch(() => null);
                    if (thread) {
                        const message = await thread.messages.fetch(server.battlemetricsMessageId).catch(() => null);
                        if (message) {
                            const embed = generateBattleMetricsEmbed(client);
                            await message.edit({ embeds: [embed] });
                            console.log(`[Battlemetrics] Updated embed for ${server.title}`);
                        }
                        break; // Found the thread, move to next server
                    }
                } catch (e) {
                    // Ignore fetch errors
                }
            }
        } catch (e) {
            console.error(`[Battlemetrics] Failed to update embed for ${server.title}:`, e);
        }
    }
}

let updateCounter = 0;

async function runLoop() {
    if (!appState.fcmHandler) return;
    
    const state = appState.fcmHandler.state;
    let needsDashboardUpdate = false;

    // Run embed updates every 10 minutes (10 * 60s)
    updateCounter++;
    if (updateCounter >= 10) {
        updateCounter = 0;
        void updateServerEmbeds();
    }

    for (const [serverId, server] of Object.entries(state.serverList)) {
        if (!server.battlemetricsId) continue;

        let client = clients.get(serverId);
        
        try {
            if (!client) {
                // Initialize
                console.log(`[Battlemetrics] Initializing client for ${server.title} (${server.battlemetricsId})`);
                client = createBattlemetricsClient(parseInt(server.battlemetricsId), null);
                await client.setup();
                clients.set(serverId, client);
            } else {
                // Update
                const success = await client.evaluation();
                if (success) {
                    if (client.loginPlayers.length > 0 || client.logoutPlayers.length > 0) {
                        needsDashboardUpdate = true;
                    }
                }
            }

            // --- Feature: Join/Leave Notifications (In-Game) ---
            const rustPlus = getRustPlus();
            if (rustPlus && rustPlus.isConnected()) {
                // Check Logins
                for (const playerId of client.loginPlayers) {
                    const player = client.players[playerId];
                    // Check ID or Name
                    if (watchedPlayers.has(playerId) || Array.from(watchedPlayers.values()).some(e => e.name === player.name)) {
                        const name = player.name;
                        console.log(`[Watchlist] Player JOINED: ${name} (${playerId})`);
                        rustPlus.sendTeamMessage(`[MSS] 🟢 WATCHED PLAYER JOINED: ${name}`);
                    }
                }
                
                // Check Logouts
                for (const playerId of client.logoutPlayers) {
                    const player = client.players[playerId];
                    if (watchedPlayers.has(playerId) || Array.from(watchedPlayers.values()).some(e => e.name === player.name)) {
                        const name = player.name;
                        console.log(`[Watchlist] Player LEFT: ${name} (${playerId})`);
                        rustPlus.sendTeamMessage(`[MSS] 🔴 WATCHED PLAYER LEFT: ${name}`);
                    }
                }
            }

            // --- Feature: Player Activity Log & Detection ---
            if (client.loginPlayers.length > 0) {
                const namesArray = client.loginPlayers.map((id: string) => client!.players[id]?.name || id);
                
                // Detection: Check if any joining player matches a watched NAME
                const onlineNames = new Set(client.onlinePlayers.map((id: string) => client!.players[id]?.name));
                
                for (const joinedName of namesArray) {
                    // Iterate watchlist entries
                    for (const entry of watchedPlayers.values()) {
                        if (entry.name === joinedName) {
                            console.log(`[Watchlist] Watched player ${entry.name} detected on ${server.title}!`);
                            
                            // Run detection
                            teamDetector.detectTeam(entry.steamId, onlineNames).then(teammates => {
                                if (teammates.length > 0) {
                                    const teamEmbed = new EmbedBuilder()
                                        .setTitle(`🚨 Watched Player Detected: ${entry.name}`)
                                        .setColor(Colors.Red)
                                        .setDescription(`**Server:** ${server.title}\n**Found ${teammates.length} potential teammates online:**`)
                                        .addFields({
                                            name: 'Teammates',
                                            value: teammates.map(p => `${p.name} (${p.steam_id})`).join('\n').substring(0, 1024)
                                        })
                                        .setTimestamp();
                                    
                                    for (const channel of appState.pairingChannels.values()) {
                                        channel.send({ embeds: [teamEmbed] });
                                    }
                                }
                            }).catch(err => console.error("[Watchlist] Detection failed:", err));
                        }
                    }
                }
            }

        } catch (e) {
            console.error(`[Battlemetrics] Error updating ${server.title}:`, e);
        }
    }

    if (needsDashboardUpdate) {
        updateWatchlistDashboard();
    }
}