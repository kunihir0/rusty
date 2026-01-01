import { ActionRowBuilder, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle, CommandInteraction, EmbedBuilder, Colors, MessageFlags } from "discord.js";
import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import { appState } from "../state/AppState";
import { JsonPersistenceManager } from "../rustplus/PersistenceManager";
import path from "path";

@Discord()
@SlashGroup({ name: "devices", description: "Manage paired devices (Alarms, Switches, Monitors)" })
@SlashGroup("devices")
export class DeviceCommands {
    
    private getPersistence(): JsonPersistenceManager {
        return new JsonPersistenceManager(path.join(process.cwd(), 'fcm-state.json'));
    }

    @Slash({ name: "list", description: "List all paired devices" })
    async list(interaction: CommandInteraction): Promise<void> {
        if (!appState.fcmHandler) {
            await interaction.reply({ content: "FCM Handler not active.", flags: MessageFlags.Ephemeral });
            return;
        }

        const state = appState.fcmHandler.state;
        const embed = new EmbedBuilder()
            .setTitle("📱 Paired Devices")
            .setColor(Colors.Blue)
            .setTimestamp();

        let hasDevices = false;

        for (const [serverId, server] of Object.entries(state.serverList)) {
            const serverTitle = server.title || serverId;
            let fieldValue = "";

            if (server.switches && Object.keys(server.switches).length > 0) {
                fieldValue += `**Switches:**\n${Object.entries(server.switches).map(([id, s]: [string, any]) => `\`${id}\` - ${s.name}`).join('\n')}\n`;
            }
            if (server.alarms && Object.keys(server.alarms).length > 0) {
                fieldValue += `**Alarms:**\n${Object.entries(server.alarms).map(([id, a]: [string, any]) => `\`${id}\` - ${a.name}`).join('\n')}\n`;
            }
            if (server.storageMonitors && Object.keys(server.storageMonitors).length > 0) {
                fieldValue += `**Monitors:**\n${Object.entries(server.storageMonitors).map(([id, m]: [string, any]) => `\`${id}\` - ${m.name}`).join('\n')}\n`;
            }

            if (fieldValue) {
                embed.addFields({ name: serverTitle, value: fieldValue.substring(0, 1024) });
                hasDevices = true;
            }
        }

        if (!hasDevices) {
            embed.setDescription("No devices found.");
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    @Slash({ name: "remove", description: "Remove a specific device by ID" })
    async remove(
        @SlashChoice("Switch", "switch")
        @SlashChoice("Alarm", "alarm")
        @SlashChoice("Monitor", "monitor")
        @SlashOption({
            description: "Device Type",
            name: "type",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        type: string,

        @SlashOption({
            description: "Entity ID",
            name: "entity_id",
            required: true,
            type: ApplicationCommandOptionType.String 
        })
        entityIdStr: string,

        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        if (!appState.fcmHandler) {
            await interaction.editReply("FCM Handler not active.");
            return;
        }

        const entityId = entityIdStr.trim();
        const state = appState.fcmHandler.state;
        let deleted = false;
        let serverFound = "";

        for (const serverId in state.serverList) {
            const server = state.serverList[serverId];
            
            if (type === 'switch' && server.switches && server.switches[entityId]) {
                delete server.switches[entityId];
                deleted = true;
                serverFound = server.title;
            } else if (type === 'alarm' && server.alarms && server.alarms[entityId]) {
                delete server.alarms[entityId];
                deleted = true;
                serverFound = server.title;
            } else if (type === 'monitor' && server.storageMonitors && server.storageMonitors[entityId]) {
                delete server.storageMonitors[entityId];
                deleted = true;
                serverFound = server.title;
            }

            if (deleted) break;
        }

        if (deleted) {
            this.getPersistence().saveState(state);
            await interaction.editReply(`✅ Removed **${type}** 
${entityId}
 from **${serverFound || 'Unknown Server'}**.`);
        } else {
            await interaction.editReply(`❌ Could not find **${type}** with ID 
${entityId}
.`);
        }
    }

    @Slash({ name: "clear", description: "Clear ALL devices of a certain type" })
    async clear(
        @SlashChoice("All Devices", "all")
        @SlashChoice("All Switches", "switches")
        @SlashChoice("All Alarms", "alarms")
        @SlashChoice("All Monitors", "monitors")
        @SlashOption({
            description: "What to clear",
            name: "target",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        target: string,

        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!appState.fcmHandler) {
            await interaction.editReply("FCM Handler not active.");
            return;
        }

        const state = appState.fcmHandler.state;
        let count = 0;

        for (const serverId in state.serverList) {
            const server = state.serverList[serverId];

            if (target === 'all' || target === 'switches') {
                if (server.switches) {
                    count += Object.keys(server.switches).length;
                    server.switches = {};
                }
            }
            if (target === 'all' || target === 'alarms') {
                if (server.alarms) {
                    count += Object.keys(server.alarms).length;
                    server.alarms = {};
                }
            }
            if (target === 'all' || target === 'monitors') {
                if (server.storageMonitors) {
                    count += Object.keys(server.storageMonitors).length;
                    server.storageMonitors = {};
                }
            }
        }

        if (count > 0) {
            this.getPersistence().saveState(state);
            await interaction.editReply(`✅ Cleared **${count}** devices (${target}).`);
        } else {
            await interaction.editReply(`No devices found to clear.`);
        }
    }
}
