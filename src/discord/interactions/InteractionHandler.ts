import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ComponentType, EmbedBuilder, ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextInputBuilder, TextInputStyle, type Interaction, ThreadChannel, type MessageActionRowComponent, type APIButtonComponentWithCustomId } from "discord.js";
import path from "path";
import { appState } from "../../state/AppState";
import { JsonPersistenceManager } from "../../rustplus/PersistenceManager";
import { RustPlus } from "../../rustplus/ws";
import { RECYCLING_RESOURCES, RESOURCE_NAMES } from "../../rustplus/utils/Recycling";
import { refreshDashboard, removeFromWatchList } from "../services/BattlemetricsManager";
import { connectToRustServer } from "../services/RustPlusManager";

async function findDeviceThread(guildId: string, threadName: string): Promise<ThreadChannel | null> {
    if (!appState.pairingChannels.has(guildId)) return null;
    const channel = appState.pairingChannels.get(guildId);
    if (!channel) return null;

    try {
        // Try cache first
        let thread = channel.threads.cache.find(t => t.name === threadName) as ThreadChannel;
        if (!thread) {
            // Fetch active
            const fetched = await channel.threads.fetch();
            thread = fetched.threads.find(t => t.name === threadName) as ThreadChannel;
        }
        return thread || null;
    } catch (e) {
        console.error("Error finding thread:", e);
        return null;
    }
}

export async function handleInteraction(interaction: Interaction): Promise<boolean> {
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Watchlist Handlers
    if (customId === 'watchlist-refresh') {
        await interaction.deferReply({ ephemeral: true });
        await refreshDashboard();
        await interaction.editReply("Dashboard refreshed.");
        return true;
    }

    if (customId.startsWith("pair-") || customId.startsWith("disconnect-") || customId.startsWith("remove-")) {
      const serverId = customId.substring(customId.indexOf('-') + 1);
      
      if (!appState.fcmHandler || !appState.fcmHandler.state.serverList[serverId]) {
        await interaction.reply({ content: "Server data not found. It might be stale.", flags: [64] });
        return true;
      }

      const server = appState.fcmHandler.state.serverList[serverId];

      if (customId.startsWith("pair-")) {
        await interaction.deferUpdate();
        try {
          // Use Manager to connect
          const newRustPlus = await connectToRustServer(serverId);
          
          newRustPlus.once('connected', async () => {
            console.log(`Successfully paired with ${server.title}`);
            const row = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder().setCustomId(`disconnect-${serverId}`).setLabel("Disconnect").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`remove-${serverId}`).setLabel("Remove").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setURL(server.url).setLabel("Website").setStyle(ButtonStyle.Link),
                new ButtonBuilder().setURL(`https://www.battlemetrics.com/servers/rust/${server.battlemetricsId}`).setLabel("BattleMetrics").setStyle(ButtonStyle.Link)
              );
            await interaction.editReply({ components: [row] });
          });

          newRustPlus.once('error', async (e) => {
            console.error(`Failed to pair with ${server.title}:`, e);
            await interaction.followUp({ content: `Failed to connect: ${e.message}`, flags: [64] });
          });

        } catch (e: any) {
          console.error("Pairing failed:", e);
          await interaction.followUp({ content: `An error occurred during pairing: ${e.message}`, flags: [64] });
        }
      } else if (customId.startsWith("disconnect-")) {
        await interaction.deferUpdate();
        if (appState.rustPlus) {
          appState.rustPlus.disconnect();
          appState.rustPlus = undefined;
          console.log(`Disconnected from ${serverId}`);
        }

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId(`pair-${serverId}`).setLabel("Pair").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`remove-${serverId}`).setLabel("Remove").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setURL(server.url).setLabel("Website").setStyle(ButtonStyle.Link),
            new ButtonBuilder().setURL(`https://www.battlemetrics.com/servers/rust/${server.battlemetricsId}`).setLabel("BattleMetrics").setStyle(ButtonStyle.Link)
          );
        await interaction.editReply({ components: [row] });

      } else { // remove-
        await interaction.deferReply({ ephemeral: true });
        try {
            const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
            const persistence = new JsonPersistenceManager(fcmStatePath);
            const state = persistence.loadState();

            if (state.serverList && state.serverList[serverId]) {
                if (appState.rustPlus && appState.rustPlus['server'] === serverId.split('-')[0] && appState.rustPlus['port'].toString() === serverId.split('-')[1]) {
                    appState.rustPlus.disconnect();
                    appState.rustPlus = undefined;
                }

                delete state.serverList[serverId];
                if (state.serverListLite && state.serverListLite[serverId]) {
                    delete state.serverListLite[serverId];
                }
                persistence.saveState(state);

                // Delete the original message
                if (interaction.message) {
                    await interaction.message.delete();
                }

                await interaction.editReply(`Server ${serverId} has been removed.`);
            } else {
                await interaction.editReply(`Server ${serverId} not found in state file.`);
            }
        } catch (e: any) {
            console.error("Error removing server:", e);
            await interaction.editReply(`An error occurred while removing the server: ${e.message}`);
        }
      }
      return true; // Stop further processing
    } else if (customId.startsWith("switch-")) {
        const action = customId.split('-')[1];
        const entityId = parseInt(customId.split('-')[2], 10);

        if (action === 'toggle') {
            if (!appState.rustPlus || !appState.rustPlus.isConnected()) {
                 const state = appState.fcmHandler?.state;
                 let targetServerId: string | undefined;
                 
                 if (state) {
                    for (const sId in state.serverList) {
                        if (state.serverList[sId].switches && state.serverList[sId].switches[entityId]) {
                            targetServerId = sId;
                            break;
                        }
                    }
                 }

                 if (targetServerId && state) {
                    try {
                        // Use Manager to connect
                        const newRustPlus = await connectToRustServer(targetServerId);
                        
                        await new Promise<void>((resolve, reject) => {
                            const t = setTimeout(() => reject(new Error("Timeout")), 5000);
                            newRustPlus.once('connected', () => { clearTimeout(t); resolve(); });
                            newRustPlus.once('error', (e) => { clearTimeout(t); reject(e); });
                        });
                    } catch (e: any) {
                        await interaction.reply({ content: `Failed to connect: ${e.message}`, flags: [64] });
                        return true;
                    }
                 } else {
                     await interaction.reply({ content: "Not connected and cannot find server for this switch.", flags: [64] });
                     return true;
                 }
            }
            
            await interaction.deferUpdate();

            // Resolve serverId to find the switch state
            let currentServerId: string | undefined;
            const fcmState = appState.fcmHandler?.state;

            if (fcmState) {
                for (const sId in fcmState.serverList) {
                    if (fcmState.serverList[sId].switches && fcmState.serverList[sId].switches[entityId]) {
                        currentServerId = sId;
                        break;
                    }
                }
            }

            const switchState = currentServerId ? appState.fcmHandler?.state.serverList[currentServerId]?.switches[entityId] : undefined;
            if (!switchState) {
                await interaction.followUp({ content: "Switch data not found.", flags: [64]});
                return true;
            }

            const newState = !switchState.active;
            appState.rustPlus!.setEntityValue(entityId, newState, (response) => {
                if (!response.response || response.response.error) {
                    interaction.followUp({ content: `Error toggling switch: ${response.response?.error?.error || 'Unknown Error'}`, flags: [64] });
                } else {
                    switchState.active = newState;
                    
                    const updatedEmbed = new EmbedBuilder(interaction.message.embeds[0].data)
                        .setColor(newState ? Colors.Green : Colors.Red)
                        .setFields(
                            { name: 'Entity ID', value: entityId.toString(), inline: true },
                            { name: 'Location', value: switchState.location || 'N/A', inline: true },
                            { name: 'Status', value: newState ? 'ON' : 'OFF', inline: true }
                        );

                    const updatedRow = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder().setCustomId(`switch-toggle-${entityId}`).setLabel(newState ? "Turn Off" : "Turn On").setStyle(newState ? ButtonStyle.Danger : ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`switch-edit-${entityId}`).setLabel("Edit").setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`switch-remove-${entityId}`).setLabel("🗑️").setStyle(ButtonStyle.Secondary)
                        );
                    
                    const components: any[] = [updatedRow];
                    if (interaction.message.components.length > 1) {
                        components.push(ActionRowBuilder.from(interaction.message.components[1] as any) as any);
                    }

                    interaction.editReply({ embeds: [updatedEmbed], components: components });
                }
            });
        } else if (action === 'edit') {
            const modal = new ModalBuilder()
                .setTitle("Edit Smart Switch")
                .setCustomId(`edit-switch-modal-${entityId}`);

            const nameInput = new TextInputBuilder()
                .setCustomId('name')
                .setLabel("New Switch Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
            await interaction.showModal(modal);
            return true;

        } else if (action === 'remove') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                const persistence = new JsonPersistenceManager(fcmStatePath);
                const state = persistence.loadState();
                
                let found = false;
                for (const sId in state.serverList) {
                    if (state.serverList[sId].switches && state.serverList[sId].switches[entityId]) {
                        delete state.serverList[sId].switches[entityId];
                        found = true;
                        break;
                    }
                }

                if (found) {
                    persistence.saveState(state);
                    if (interaction.message) {
                        await interaction.message.delete();
                    }
                    await interaction.editReply(`Switch ${entityId} has been removed.`);
                } else {
                    await interaction.editReply(`Switch ${entityId} not found.`);
                }
            } catch (e: any) {
                await interaction.editReply(`An error occurred while removing the switch: ${e.message}`);
            }
        }
        return true;
    } else if (customId.startsWith("alarm-")) {
        const action = customId.split('-')[1];
        const entityId = parseInt(customId.split('-')[2], 10);

        if (action === 'everyone') {
            await interaction.deferUpdate();
            
            const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
            const persistence = new JsonPersistenceManager(fcmStatePath);
            const state = persistence.loadState();
            
            let serverId;
            let alarm;

            // Find the alarm in the state
            for (const sId in state.serverList) {
                if (state.serverList[sId].alarms && state.serverList[sId].alarms[entityId]) {
                    serverId = sId;
                    alarm = state.serverList[sId].alarms[entityId];
                    break;
                }
            }

            if (alarm) {
                alarm.everyone = !alarm.everyone;
                persistence.saveState(state);

                const firstRow = interaction.message.components[0] as any;
                const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    firstRow.components.map((c: any) => {
                        const newC = ButtonBuilder.from(c);
                        if ((newC.data as any).custom_id === customId) {
                            newC.setStyle(alarm.everyone ? ButtonStyle.Success : ButtonStyle.Secondary);
                        }
                        return newC;
                    })
                );
                await interaction.editReply({ components: [newRow] });
            } else {
                await interaction.followUp({ content: "Could not find the alarm state to update.", flags: [64] });
            }

        } else if (action === 'edit') {
            const modal = new ModalBuilder()
                .setTitle("Edit Smart Alarm")
                .setCustomId(`edit-alarm-modal-${entityId}`);

            const nameInput = new TextInputBuilder()
                .setCustomId('name')
                .setLabel("New Alarm Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const messageInput = new TextInputBuilder()
                .setCustomId('message')
                .setLabel("New Alarm Message")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput)
            );
            await interaction.showModal(modal);
            return true;
        } else if (action === 'remove') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                const persistence = new JsonPersistenceManager(fcmStatePath);
                const state = persistence.loadState();
                
                let found = false;
                for (const sId in state.serverList) {
                    if (state.serverList[sId].alarms && state.serverList[sId].alarms[entityId]) {
                        delete state.serverList[sId].alarms[entityId];
                        found = true;
                        break;
                    }
                }

                if (found) {
                    persistence.saveState(state);
                    if (interaction.message) {
                        await interaction.message.delete();
                    }
                    await interaction.editReply(`Alarm ${entityId} has been removed.`);
                } else {
                    await interaction.editReply(`Alarm ${entityId} not found.`);
                }
            } catch (e: any) {
                await interaction.editReply(`An error occurred while removing the alarm: ${e.message}`);
            }
        }
        return true;
    } else if (customId.startsWith("monitor-")) {
        const action = customId.split('-')[1];
        const entityId = parseInt(customId.split('-')[2], 10);

        if (action === 'ingame' || action === 'everyone') {
            await interaction.deferUpdate();
            
            const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
            const persistence = new JsonPersistenceManager(fcmStatePath);
            const state = persistence.loadState();
            
            let serverId;
            let monitor;

            for (const sId in state.serverList) {
                if (state.serverList[sId].storageMonitors && state.serverList[sId].storageMonitors[entityId]) {
                    serverId = sId;
                    monitor = state.serverList[sId].storageMonitors[entityId];
                    break;
                }
            }

            if (monitor) {
                if (action === 'ingame') {
                    monitor.inGame = !monitor.inGame;
                } else { // everyone
                    monitor.everyone = !monitor.everyone;
                }
                persistence.saveState(state);

                const firstRow = interaction.message.components[0] as any;
                const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    firstRow.components.map((c: any) => {
                        const newC = ButtonBuilder.from(c);
                        if ((newC.data as any).custom_id === customId) {
                            const currentStatus = action === 'ingame' ? monitor.inGame : monitor.everyone;
                            newC.setStyle(currentStatus ? ButtonStyle.Success : ButtonStyle.Secondary);
                        }
                        return newC;
                    })
                );
                await interaction.editReply({ components: [newRow] });
            } else {
                await interaction.followUp({ content: "Could not find the storage monitor state to update.", flags: [64] });
            }
        } else if (action === 'recycle') {
            if (!appState.rustPlus || !appState.rustPlus.isConnected()) {
                await interaction.reply({ content: "Not connected to a Rust server.", flags: [64]});
                return true;
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const info = await appState.rustPlus.sendRequestAsync({
                    entityId: entityId,
                    getEntityInfo: {},
                });

                if (info && info.entityInfo && info.entityInfo.payload && info.entityInfo.payload.items) {
                    const items = info.entityInfo.payload.items;
                    const totalResources: Record<string, number> = {};

                    for (const item of items) {
                        const resources = RECYCLING_RESOURCES[item.itemId];
                        if (resources) {
                            for (const resourceId in resources) {
                                totalResources[resourceId] = (totalResources[resourceId] || 0) + (resources[resourceId] * item.quantity);
                            }
                        }
                    }

                    let replyMessage = "### Recycled Resources:\n";
                    if (Object.keys(totalResources).length > 0) {
                        for (const resourceId in totalResources) {
                            const resourceName = RESOURCE_NAMES[resourceId] || resourceId;
                            replyMessage += `**${resourceName}:** ${totalResources[resourceId]}\n`;
                        }
                    } else {
                        replyMessage = "No recyclable resources found in this container.";
                    }

                    await interaction.editReply({ content: replyMessage });

                } else {
                    await interaction.editReply({ content: "Could not retrieve container items." });
                }

            } catch (e: any) {
                await interaction.editReply({ content: `Error retrieving items: ${e.message}` });
            }

        } else if (action === 'edit') {
            const modal = new ModalBuilder()
                .setTitle("Edit Storage Monitor")
                .setCustomId(`edit-monitor-modal-${entityId}`);

            const nameInput = new TextInputBuilder()
                .setCustomId('name')
                .setLabel("New Monitor Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
            await interaction.showModal(modal);
            return true;
        } else if (action === 'remove') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                const persistence = new JsonPersistenceManager(fcmStatePath);
                const state = persistence.loadState();
                
                let found = false;
                for (const sId in state.serverList) {
                    if (state.serverList[sId].storageMonitors && state.serverList[sId].storageMonitors[entityId]) {
                        delete state.serverList[sId].storageMonitors[entityId];
                        found = true;
                        break;
                    }
                }

                if (found) {
                    persistence.saveState(state);
                    if (interaction.message) {
                        await interaction.message.delete();
                    }
                    await interaction.editReply(`Storage Monitor ${entityId} has been removed.`);
                } else {
                    await interaction.editReply(`Storage Monitor ${entityId} not found.`);
                }
            } catch (e: any) {
                await interaction.editReply(`An error occurred while removing the monitor: ${e.message}`);
            }
        }
        return true;
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('edit-switch-modal-')) {
        const entityId = parseInt(interaction.customId.split('-')[3], 10);
        const newName = interaction.fields.getTextInputValue('name');
        
        await interaction.deferReply({ ephemeral: true });

        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
        const persistence = new JsonPersistenceManager(fcmStatePath);
        const state = persistence.loadState();
        
        let serverId;
        let switchData;

        for (const sId in state.serverList) {
            if (state.serverList[sId].switches && state.serverList[sId].switches[entityId]) {
                serverId = sId;
                switchData = state.serverList[sId].switches[entityId];
                break;
            }
        }

        if (switchData) {
            switchData.name = newName;
            persistence.saveState(state);

            if (interaction.guildId) {
                const threadName = `${state.serverList[serverId!].title} - Switches`;
                const thread = await findDeviceThread(interaction.guildId, threadName);
                
                if (thread) {
                    const messages = await thread.messages.fetch({ limit: 100 });
                    const messageToUpdate = messages.find(m => m.embeds[0]?.fields[0]?.value === entityId.toString());

                    if (messageToUpdate) {
                        const updatedEmbed = new EmbedBuilder(messageToUpdate.embeds[0].data).setTitle(newName);
                        await messageToUpdate.edit({ embeds: [updatedEmbed] });
                    }
                }
            }
            
            await interaction.editReply("Switch name updated successfully!");
        } else {
            await interaction.editReply("Could not find the switch to update.");
        }
        return true;
    } else if (interaction.customId.startsWith('edit-alarm-modal-')) {
        const entityId = parseInt(interaction.customId.split('-')[3], 10);
        const newName = interaction.fields.getTextInputValue('name');
        const newMessage = interaction.fields.getTextInputValue('message');

        await interaction.deferReply({ ephemeral: true });

        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
        const persistence = new JsonPersistenceManager(fcmStatePath);
        const state = persistence.loadState();

        let serverId;
        let alarmData;

        for (const sId in state.serverList) {
            if (state.serverList[sId].alarms && state.serverList[sId].alarms[entityId]) {
                serverId = sId;
                alarmData = state.serverList[sId].alarms[entityId];
                break;
            }
        }

        if (alarmData) {
            alarmData.name = newName;
            alarmData.message = newMessage;
            persistence.saveState(state);

            if (interaction.guildId) {
                const threadName = `${state.serverList[serverId!].title} - Alarms`;
                const thread = await findDeviceThread(interaction.guildId, threadName);

                if (thread) {
                    const messages = await thread.messages.fetch({ limit: 100 });
                    const messageToUpdate = messages.find(m => m.embeds[0]?.fields[0]?.value === entityId.toString());

                    if (messageToUpdate) {
                        const updatedEmbed = new EmbedBuilder(messageToUpdate.embeds[0].data)
                            .setTitle(newName)
                            .setFields(
                                { name: 'Entity ID', value: entityId.toString(), inline: true },
                                { name: 'Location', value: alarmData.location || 'N/A', inline: true },
                                { name: 'Last Trigger', value: messageToUpdate.embeds[0].fields[2].value, inline: false },
                                { name: 'Message', value: newMessage, inline: false }
                            );
                        await messageToUpdate.edit({ embeds: [updatedEmbed] });
                    }
                }
            }
            await interaction.editReply("Alarm updated successfully!");
        } else {
            await interaction.editReply("Could not find the alarm to update.");
        }
        return true;
    } else if (interaction.customId.startsWith('edit-monitor-modal-')) {
        const entityId = parseInt(interaction.customId.split('-')[3], 10);
        const newName = interaction.fields.getTextInputValue('name');

        await interaction.deferReply({ ephemeral: true });

        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
        const persistence = new JsonPersistenceManager(fcmStatePath);
        const state = persistence.loadState();

        let serverId;
        let monitorData;

        for (const sId in state.serverList) {
            if (state.serverList[sId].storageMonitors && state.serverList[sId].storageMonitors[entityId]) {
                serverId = sId;
                monitorData = state.serverList[sId].storageMonitors[entityId];
                break;
            }
        }

        if (monitorData) {
            monitorData.name = newName;
            persistence.saveState(state);

            if (interaction.guildId) {
                const threadName = `${state.serverList[serverId!].title} - Storage Monitors`;
                const thread = await findDeviceThread(interaction.guildId, threadName);

                if (thread) {
                    const messages = await thread.messages.fetch({ limit: 100 });
                    const messageToUpdate = messages.find(m => m.embeds[0]?.fields[0]?.value === entityId.toString());

                    if (messageToUpdate) {
                        const updatedEmbed = new EmbedBuilder(messageToUpdate.embeds[0].data).setTitle(newName);
                        await messageToUpdate.edit({ embeds: [updatedEmbed] });
                    }
                }
            }
            await interaction.editReply("Storage Monitor name updated successfully!");
        } else {
            await interaction.editReply("Could not find the storage monitor to update.");
        }
        return true;
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'watchlist-remove-menu') {
        const selectedValue = interaction.values[0];
        await interaction.deferReply({ ephemeral: true });
        
        const removed = removeFromWatchList(selectedValue);
        if (removed) {
            await interaction.editReply(`Removed **${selectedValue}** from watchlist.`);
        } else {
            await interaction.editReply(`Could not find ${selectedValue} in watchlist.`);
        }
        return true;
    }

    if (interaction.customId.startsWith('switch-auto-')) {
        const entityId = parseInt(interaction.customId.split('-')[2], 10);
        const selectedValue = interaction.values[0];

        await interaction.deferUpdate();

        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
        const persistence = new JsonPersistenceManager(fcmStatePath);
        const state = persistence.loadState();

        let serverId;
        let switchData;

        for (const sId in state.serverList) {
            if (state.serverList[sId].switches && state.serverList[sId].switches[entityId]) {
                serverId = sId;
                switchData = state.serverList[sId].switches[entityId];
                break;
            }
        }

        if (switchData) {
            // Save the auto setting
            (switchData as any).autoSetting = selectedValue;
            persistence.saveState(state);

            // Update the dropdown placeholder
            const currentEmbed = interaction.message.embeds[0];
            const currentRows = interaction.message.components;
            
            const newRows = currentRows.map(row => {
                const selectComponent = (row as any).components.find((c: any) => c.type === ComponentType.StringSelect);
                if (selectComponent && (selectComponent as any).customId === interaction.customId) {
                        const newSelect = StringSelectMenuBuilder.from(selectComponent as any);
                        
                        const options = newSelect.options;
                        const selectedOption = options.find(o => {
                            const opt = o as any;
                            return (opt.value === selectedValue) || (opt.data && opt.data.value === selectedValue);
                        });
                        
                        const newLabel = selectedOption ? ((selectedOption as any).label || (selectedOption as any).data?.label) : 'OFF';
                        
                        newSelect.setPlaceholder(`AUTO SETTING: ${newLabel}`);
                        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(newSelect);
                }
                return ActionRowBuilder.from(row as any);
            });

            await interaction.editReply({ embeds: [currentEmbed], components: newRows as any });
        } else {
                await interaction.followUp({ content: "Switch not found.", flags: [64] });
        }
        return true;
    }
  }
  return false;
}
