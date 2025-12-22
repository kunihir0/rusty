import { Message } from "discord.js";
import { appState } from "../../state/AppState";
import { AppMessage } from "../../gen/rustplus_pb";
import { getRustPlus, getCurrentServerId } from "./RustPlusManager";

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
        
        const threadName = `${server.title} - Team Chat`;
        
        for (const channel of appState.pairingChannels.values()) {
            let thread = channel.threads.cache.find(t => t.name === threadName);
            if (!thread) {
                try {
                    const fetched = await channel.threads.fetch();
                    thread = fetched.threads.find(t => t.name === threadName);
                    
                    if (!thread) {
                         thread = await channel.threads.create({
                             name: threadName,
                             autoArchiveDuration: 10080,
                             reason: 'Team Chat Bridge'
                         });
                    }
                } catch (e) {
                    console.error("Error managing Team Chat thread:", e);
                }
            }
            
            if (thread) {
                await thread.send(`**${name}**: ${content}`);
            }
        }
    }
}
