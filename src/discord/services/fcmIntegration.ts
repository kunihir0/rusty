import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ThreadChannel } from "discord.js";
import path from "path";
import { appState } from "../../state/AppState";
import { JsonPersistenceManager } from "../../rustplus/PersistenceManager";

async function getTargetThreads(serverId: string, suffix: string): Promise<ThreadChannel[]> {
    const server = appState.fcmHandler?.state.serverList[serverId];
    if (!server) return [];

    const threads: ThreadChannel[] = [];
    const threadName = `${server.title} - ${suffix}`;

    for (const channel of appState.pairingChannels.values()) {
        try {
            // Try to find existing thread by name in the channel
            const fetched = await channel.threads.fetch();
            let thread = fetched.threads.find(t => t.name === threadName);

            if (!thread) {
                // Check archived threads if necessary, or just create new
                // For simplicity, create new if not in active
                thread = await channel.threads.create({
                    name: threadName,
                    autoArchiveDuration: 10080, // 1 week
                    reason: `Device thread: ${threadName}`
                });
            }
            threads.push(thread);
        } catch (e) {
            console.error(`Failed to find/create thread '${threadName}' in channel ${channel.id}:`, e);
        }
    }
    return threads;
}

export async function handleFcmEvent(type: string, data: any) {
    if (type === 'PAIRING_SERVER') {
        console.log('FCM Handler State after pairing event:', appState.fcmHandler?.state);
        for (const channel of appState.pairingChannels.values()) {
        try {
            // Create a new thread for the server
            // We verify if one with exact name exists first to avoid duplicates on repair
            const fetched = await channel.threads.fetch();
            let thread = fetched.threads.find(t => t.name === data.data.title);

            if (!thread) {
                thread = await channel.threads.create({
                    name: data.data.title,
                    autoArchiveDuration: 10080, // 1 week
                    reason: `New server pairing: ${data.data.title}`,
                });
            }

            // Save thread ID to the server state (Primary Server Thread)
            if (appState.fcmHandler) {
                appState.fcmHandler.state.serverList[data.serverId].discordThreadId = thread.id;
                
                const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                const persistence = new JsonPersistenceManager(fcmStatePath);
                persistence.saveState(appState.fcmHandler.state);
            }

            const serverEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(data.data.title)
            .setDescription(data.data.description)
            .setThumbnail(data.data.img)
            .addFields(
                { name: 'IP', value: data.data.serverIp, inline: true },
                { name: 'Port', value: data.data.appPort.toString(), inline: true },
                { name: 'Player', value: data.data.steamId, inline: true }
            )
            .setFooter({ text: "收到新的服务器配对" });

            const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder().setCustomId(`pair-${data.serverId}`).setLabel("Pair").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`remove-${data.serverId}`).setLabel("Remove").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setURL(data.data.url).setLabel("Website").setStyle(ButtonStyle.Link),
                new ButtonBuilder().setURL(`https://www.battlemetrics.com/servers/rust/${data.data.battlemetricsId}`).setLabel("BattleMetrics").setStyle(ButtonStyle.Link)
            );

            await thread.send({ embeds: [serverEmbed], components: [row] });

        } catch (e) {
            console.error("Failed to create thread or send message:", e);
        }
        }
    }
    else if (type === 'PAIRING_SWITCH') {
        if (!appState.fcmHandler) return;
        const threads = await getTargetThreads(data.serverId, "Switches");

        for (const thread of threads) {
            const switchData = data.data;

            const switchEmbed = new EmbedBuilder()
                .setColor(switchData.active ? Colors.Green : Colors.Red)
                .setTitle(switchData.name)
                .addFields(
                    { name: 'Entity ID', value: data.entityId, inline: true },
                    { name: 'Location', value: switchData.location || 'N/A', inline: true },
                    { name: 'Status', value: switchData.active ? 'ON' : 'OFF', inline: true }
                );

            const rowButtons = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId(`switch-toggle-${data.entityId}`).setLabel(switchData.active ? "Turn Off" : "Turn On").setStyle(switchData.active ? ButtonStyle.Danger : ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`switch-edit-${data.entityId}`).setLabel("Edit").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`switch-remove-${data.entityId}`).setLabel("🗑️").setStyle(ButtonStyle.Secondary)
                );
            
            const rowSelect = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`switch-auto-${data.entityId}`)
                        .setPlaceholder('AUTO SETTING: OFF')
                        .addOptions(
                            new StringSelectMenuOptionBuilder().setLabel('OFF').setValue('off'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-DAY').setValue('day'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-NIGHT').setValue('night'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-ON').setValue('on'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-OFF').setValue('off_cycle'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-ON-PROXIMITY').setValue('on_proximity'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-OFF-PROXIMITY').setValue('off_proximity'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-ON-ANY-ONLINE').setValue('on_online'),
                            new StringSelectMenuOptionBuilder().setLabel('AUTO-OFF-ANY-ONLINE').setValue('off_online'),
                        )
                );

            await thread.send({ embeds: [switchEmbed], components: [rowButtons, rowSelect] });
        }
    }
    else if (type === 'PAIRING_ALARM') {
        if (!appState.fcmHandler) return;
        const threads = await getTargetThreads(data.serverId, "Alarms");

        for (const thread of threads) {
            const alarmData = data.data;

            const alarmEmbed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setTitle(alarmData.name)
                .addFields(
                    { name: 'Entity ID', value: data.entityId, inline: true },
                    { name: 'Location', value: alarmData.location || 'N/A', inline: true },
                    { name: 'Last Trigger', value: 'Never', inline: false },
                    { name: 'Message', value: alarmData.message, inline: false }
                );

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId(`alarm-everyone-${data.entityId}`).setLabel("@everyone").setStyle(alarmData.everyone ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`alarm-edit-${data.entityId}`).setLabel("Edit").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`alarm-remove-${data.entityId}`).setLabel("🗑️").setStyle(ButtonStyle.Secondary)
                );

            await thread.send({ embeds: [alarmEmbed], components: [row] });
        }
    }
    else if (type === 'PAIRING_STORAGE_MONITOR') {
        if (!appState.fcmHandler) return;
        const threads = await getTargetThreads(data.serverId, "Storage Monitors");

        for (const thread of threads) {
            const monitorData = data.data;
            const isTC = monitorData.type === 'toolCupboard';
            
            const monitorEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(monitorData.name)
                .addFields(
                    { name: 'Entity ID', value: data.entityId, inline: true },
                    { name: 'Location', value: monitorData.location || 'N/A', inline: true }
                );

            if (isTC) {
                // Upkeep time needs calculation from expiry
                const upkeep = monitorData.extraInfo.expiry > 0 ? `<t:${monitorData.extraInfo.expiry}:R>` : 'Decaying';
                monitorEmbed.addFields({ name: 'Upkeep', value: upkeep, inline: false });
            } else {
                const capacity = `${monitorData.extraInfo.items.length}/${monitorData.extraInfo.capacity}`;
                monitorEmbed.addFields({ name: 'Capacity', value: capacity, inline: true });
            }
            
            // Add items field if they exist
            if (monitorData.extraInfo && monitorData.extraInfo.items.length > 0) {
                const itemsString = monitorData.extraInfo.items.map((i: any) => `${i.quantity}x ${i.itemId}`).join('\n'); // Assuming itemId needs mapping to name
                monitorEmbed.addFields({ name: 'Items', value: itemsString.substring(0, 1024) });
            }

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId(`monitor-everyone-${data.entityId}`).setLabel("@everyone").setStyle(monitorData.everyone ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`monitor-ingame-${data.entityId}`).setLabel("IN-GAME").setStyle(monitorData.inGame ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`monitor-edit-${data.entityId}`).setLabel("Edit").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`monitor-remove-${data.entityId}`).setLabel("🗑️").setStyle(ButtonStyle.Secondary)
                );
            
            if (!isTC) {
                row.addComponents(new ButtonBuilder().setCustomId(`monitor-recycle-${data.entityId}`).setLabel("Recycle").setStyle(ButtonStyle.Primary));
            }
            
            await thread.send({ embeds: [monitorEmbed], components: [row] });
        }
    }
    else if (type === 'ALARM_TRIGGER') {
        if (!appState.fcmHandler) return;
        
        const server = appState.fcmHandler.state.serverList[data.serverId];
        if (!server) return;

        const alarm = server.alarms[data.entityId];
        const threads = await getTargetThreads(data.serverId, "Alarms");

        for (const thread of threads) {
            const alarmName = alarm ? alarm.name : 'Smart Alarm';
            const embed = new EmbedBuilder()
                .setTitle(`🚨 ${alarmName} Triggered!`)
                .setColor(Colors.Red)
                .setDescription(data.message)
                .setTimestamp();

            let content = "";
            if (alarm && alarm.everyone) {
                content = "@everyone";
            }

            await thread.send({ content: content || undefined, embeds: [embed] });
        }
    }
}
