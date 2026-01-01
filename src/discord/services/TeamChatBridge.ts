import { Message, ThreadChannel } from "discord.js";
import { appState } from "../../state/AppState";
import { AppMessage } from "../../gen/rustplus_pb";
import { getRustPlus, getCurrentServerId } from "./RustPlusManager";
import { configManager } from "../../config/BotConfig";
import { addToWatchList, getWatchListStatus } from "./BattlemetricsManager";

let lastReplyTime = 0;
const pendingThreadCreations = new Map<string, Promise<ThreadChannel | null>>();

export async function onDiscordMessage(message: Message) {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;
    if (!message.channel.name.endsWith(" - Team Chat")) return;

    const serverTitle = message.channel.name.replace(" - Team Chat", "");
    
    const rustPlus = getRustPlus();
    const currentServerId = getCurrentServerId();
    
    if (!rustPlus || !rustPlus.isConnected() || !currentServerId) {
        await message.react('❌'); // Not connected
        return;
    }
    
    const server = appState.fcmHandler?.state.serverList[currentServerId];
    if (!server || server.title !== serverTitle) {
        await message.react('⚠️'); // Connected to different server
        return;
    }

    rustPlus.sendTeamMessage(`${message.author.username}: ${message.content}`);
    await message.react('✅');
}

export async function onRustMessage(message: AppMessage, serverId: string) {
    if (message.broadcast && message.broadcast.teamMessage) {
        const tm = message.broadcast.teamMessage;
        const content = tm.message?.message;
        const name = tm.message?.name;
        
        const server = appState.fcmHandler?.state.serverList[serverId];
        if (!server) return;
        
        // --- In-Game Commands ---
        const config = configManager.getConfig();
        const prefix = config.ingamePrefix;
        const cooldownMs = config.replyCooldownSeconds * 1000;

        // MSS Watchlist Commands
        if (content) {
            if (content.startsWith(`${prefix}mss add `)) {
                const steamId = content.substring(prefix.length + 8).trim(); // prefix + "mss add "
                const result = await addToWatchList(steamId);
                const rustPlus = getRustPlus();
                if (rustPlus) {
                    rustPlus.sendTeamMessage(`[MSS] ${result.message}`);
                }
            }
            
            if (content === `${prefix}mss status`) {
                const status = getWatchListStatus();
                const rustPlus = getRustPlus();
                if (rustPlus) {
                    rustPlus.sendTeamMessage(status);
                }
            }
        }

        if (config.enableShopCommand && content && content.startsWith(`${prefix}shop `)) {
            const now = Date.now();
            if (now - lastReplyTime >= cooldownMs) {
                const query = content.substring(prefix.length + 5).trim();
                if (query.length > 1) {
                    const rustPlus = getRustPlus();
                    if (rustPlus && appState.vendingMachineService && appState.mapSize) {
                        lastReplyTime = now;
                        const result = appState.vendingMachineService.search(query, appState.mapSize, 'sell');
                        
                        if ('error' in result && result.error) {
                             rustPlus.sendTeamMessage(`Shop: ${result.error}`);
                        } else {
                            const searchResult = result as { queryItem: string, results: any[] };
                            if (searchResult.results.length === 0) {
                                 rustPlus.sendTeamMessage(`Shop: No selling offers found for ${searchResult.queryItem}`);
                            } else {
                                // Sort by cost (cheapest first)
                                const sorted = searchResult.results.sort((a, b) => a.cost - b.cost);
                                const top = sorted.slice(0, 3);
                                
                                let currentMsg = "";
                                const MAX_LEN = 128;
    
                                for (const offer of top) {
                                    // Compact format: [G15] 100x -> 20 Scrap
                                    const line = `[${offer.grid}] ${offer.quantity}x -> ${offer.cost} ${offer.currencyName}`;
                                    
                                    // Check if adding this line would exceed limit (plus separator)
                                    if (currentMsg.length > 0 && (currentMsg.length + line.length + 2) > MAX_LEN) {
                                        rustPlus.sendTeamMessage(currentMsg);
                                        currentMsg = line;
                                    } else {
                                        if (currentMsg.length > 0) currentMsg += " | ";
                                        currentMsg += line;
                                    }
                                }
                                if (currentMsg.length > 0) {
                                    rustPlus.sendTeamMessage(currentMsg);
                                }
                            }
                        }
                    }
                }
            }
        }
        // ------------------------

        if (!config.enableTeamChatLogging) return;

        const threadName = `${server.title} - Team Chat`;
        
        for (const channel of appState.pairingChannels.values()) {
            const lockKey = `${channel.id}-${threadName}`;
            
            // Check for existing lock
            if (pendingThreadCreations.has(lockKey)) {
                try {
                    const existingThread = await pendingThreadCreations.get(lockKey);
                    if (existingThread) {
                        await existingThread.send(`**${name}**: ${content}`);
                    }
                } catch (e) {
                    console.error("Error awaiting pending thread:", e);
                }
                continue;
            }

            // Create lock promise
            const promise = (async () => {
                let thread = channel.threads.cache.find(t => t.name === threadName) as ThreadChannel;
                if (!thread) {
                    try {
                        const fetched = await channel.threads.fetch();
                        thread = fetched.threads.find(t => t.name === threadName) as ThreadChannel;
                        
                        if (!thread) {
                             thread = await channel.threads.create({
                                 name: threadName,
                                 autoArchiveDuration: 10080,
                                 reason: 'Team Chat Bridge'
                             }) as ThreadChannel;
                        }
                    } catch (e) {
                        console.error("Error managing Team Chat thread:", e);
                        return null;
                    }
                }
                return thread as ThreadChannel;
            })();

            pendingThreadCreations.set(lockKey, promise);

            try {
                const thread = await promise;
                if (thread) {
                    await thread.send(`**${name}**: ${content}`);
                }
            } finally {
                // Cleanup lock after a short delay to ensure propagation
                setTimeout(() => pendingThreadCreations.delete(lockKey), 1000);
            }
        }
    }
}