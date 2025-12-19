import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Colors, ComponentType, EmbedBuilder, IntentsBitField, ModalBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, TextChannel, TextInputBuilder, TextInputStyle, type Interaction, type Message } from "discord.js";
import { Client } from "discordx";
import { RustPlus } from "./rustplus/ws";
import { createFcmHandler, FcmHandlerConfig } from "./rustplus/fcmHandler";
import { JsonPersistenceManager } from "./rustplus/PersistenceManager";
import path from "path";
import { RECYCLING_RESOURCES, RESOURCE_NAMES } from "./rustplus/utils/Recycling";

// Shared mutable state
export const appState: {
    rustPlus?: RustPlus;
    fcmHandler?: ReturnType<typeof createFcmHandler>;
    pairingChannels: Map<string, TextChannel>;
} = {
    pairingChannels: new Map<string, TextChannel>()
};

export const bot = new Client({
  // To use only guild command
  // botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],

  // Discord intents
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
  ],

  // Debug logs are disabled in silent mode
  silent: false,

  // Configuration for @SimpleCommand
  simpleCommand: {
    prefix: "!",
  },
});

bot.once("ready", async () => {
  await bot.guilds.fetch();
  void bot.initApplicationCommands();
  console.log("Bot started");

  // Setup pairing channels
  for (const guild of bot.guilds.cache.values()) {
    try {
      let category = guild.channels.cache.find(c => c.name === "伟大的" && c.type === ChannelType.GuildCategory);
      if (!category) {
        category = await guild.channels.create({ name: "伟大的", type: ChannelType.GuildCategory });
      }

      let channel = guild.channels.cache.find(c => c.name === "配对" && c.parentId === category.id) as TextChannel;
      if (!channel) {
        channel = await guild.channels.create({ name: "配对", type: ChannelType.GuildText, parent: category.id }) as TextChannel;
      }
      appState.pairingChannels.set(guild.id, channel);
    } catch(e) {
      console.error(`Failed to setup pairing channel for guild ${guild.name}:`, e);
    }
  }

  // Load credentials and initialize handlers
  const credentialsPath = path.join(process.cwd(), 'credentials.json');
  const credentialManager = new JsonPersistenceManager(credentialsPath);
  const savedCreds = credentialManager.loadState();

  let envPlayerId = process.env.RUSTPLUS_PLAYER_ID;
  let envPlayerToken = process.env.RUSTPLUS_PLAYER_TOKEN ? parseInt(process.env.RUSTPLUS_PLAYER_TOKEN) : undefined;
  let envServer = process.env.RUSTPLUS_SERVER;
  let envPort = process.env.RUSTPLUS_PORT ? parseInt(process.env.RUSTPLUS_PORT) : undefined;
  let envAndroidId = process.env.RUSTPLUS_GOOGLE_PUSH_ANDROID_ID;
  let envSecurityToken = process.env.RUSTPLUS_GOOGLE_PUSH_SECURITY_TOKEN;

  if (savedCreds.steamId) envPlayerId = savedCreds.steamId;
  if (savedCreds.androidId) envAndroidId = savedCreds.androidId;
  if (savedCreds.securityToken) envSecurityToken = savedCreds.securityToken;

  if (envServer && envPort && envPlayerId && envPlayerToken) {
    appState.rustPlus = new RustPlus(envServer, envPort, envPlayerId, envPlayerToken);
    appState.rustPlus.on('connected', () => console.log("RustPlus connected!"));
    appState.rustPlus.on('error', (e) => console.error("RustPlus error:", e));
    appState.rustPlus.connect();
  } else {
    console.warn("RustPlus environment variables missing. Skipping connection.");
  }

  if (envAndroidId && envSecurityToken && envPlayerId) {
    const persistenceManager = new JsonPersistenceManager(path.join(process.cwd(), 'fcm-state.json'));
    appState.fcmHandler = createFcmHandler({
      androidId: envAndroidId,
      securityToken: envSecurityToken,
      steamId: envPlayerId,
      persistenceManager,
      rustplus: appState.rustPlus,
      onEvent: async (type, data) => {
        if (type === 'PAIRING_SERVER') {
          console.log('FCM Handler State after pairing event:', appState.fcmHandler?.state);
          for (const channel of appState.pairingChannels.values()) {
            try {
              // Create a new thread for the server
              const thread = await channel.threads.create({
                name: data.data.title,
                autoArchiveDuration: 10080, // 1 week
                reason: `New server pairing: ${data.data.title}`,
              });

              // Save thread ID to the server state
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
        // ... (logic for PAIRING_SERVER)
        else if (type === 'PAIRING_SWITCH') {
            if (!appState.fcmHandler) return;

            const server = appState.fcmHandler.state.serverList[data.serverId];
            if (!server) return;

            for (const channel of appState.pairingChannels.values()) {
                let threadId = server.discordThreadId;
                let thread;

                if (threadId) {
                    thread = channel.threads.cache.get(threadId);
                    if (!thread) {
                         try {
                             thread = await channel.threads.fetch(threadId);
                         } catch (e) {
                             console.warn("Thread not found even after fetch, might be deleted.");
                         }
                    }
                }

                if (!thread) {
                    const fetchedThreads = await channel.threads.fetch();
                    const existingThread = fetchedThreads.threads.find(t => t.name === server.title);
                    
                    if (existingThread) {
                        thread = existingThread;
                    } else {
                         try {
                            thread = await channel.threads.create({
                                name: server.title,
                                autoArchiveDuration: 10080,
                                reason: `Server pairing thread (Restored): ${server.title}`,
                            });
                        } catch (e) {
                            console.error("Failed to create thread:", e);
                            continue;
                        }
                    }
                    
                    if (thread) {
                        server.discordThreadId = thread.id;
                        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                        const persistence = new JsonPersistenceManager(fcmStatePath);
                        persistence.saveState(appState.fcmHandler.state);
                    }
                }

                if (thread) {
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
        }
        else if (type === 'PAIRING_ALARM') {
            if (!appState.fcmHandler) return;

            const server = appState.fcmHandler.state.serverList[data.serverId];
            if (!server) return;

            for (const channel of appState.pairingChannels.values()) {
                let threadId = server.discordThreadId;
                let thread;

                if (threadId) {
                    thread = channel.threads.cache.get(threadId);
                    if (!thread) {
                         try {
                             thread = await channel.threads.fetch(threadId);
                         } catch (e) {
                             console.warn("Thread not found even after fetch, might be deleted.");
                         }
                    }
                }

                if (!thread) {
                    const fetchedThreads = await channel.threads.fetch();
                    const existingThread = fetchedThreads.threads.find(t => t.name === server.title);
                    
                    if (existingThread) {
                        thread = existingThread;
                    } else {
                         try {
                            thread = await channel.threads.create({
                                name: server.title,
                                autoArchiveDuration: 10080,
                                reason: `Server pairing thread (Restored): ${server.title}`,
                            });
                        } catch (e) {
                            console.error("Failed to create thread:", e);
                            continue;
                        }
                    }
                    
                    if (thread) {
                        server.discordThreadId = thread.id;
                        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                        const persistence = new JsonPersistenceManager(fcmStatePath);
                        persistence.saveState(appState.fcmHandler.state);
                    }
                }

                if (thread) {
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
        }
        else if (type === 'PAIRING_STORAGE_MONITOR') {
            if (!appState.fcmHandler) return;

            const server = appState.fcmHandler.state.serverList[data.serverId];
            if (!server) return;

            for (const channel of appState.pairingChannels.values()) {
                let threadId = server.discordThreadId;
                let thread;

                if (threadId) {
                    thread = channel.threads.cache.get(threadId);
                    if (!thread) {
                         try {
                             thread = await channel.threads.fetch(threadId);
                         } catch (e) {
                             console.warn("Thread not found even after fetch, might be deleted.");
                         }
                    }
                }

                if (!thread) {
                    const fetchedThreads = await channel.threads.fetch();
                    const existingThread = fetchedThreads.threads.find(t => t.name === server.title);
                    
                    if (existingThread) {
                        thread = existingThread;
                    } else {
                         try {
                            thread = await channel.threads.create({
                                name: server.title,
                                autoArchiveDuration: 10080,
                                reason: `Server pairing thread (Restored): ${server.title}`,
                            });
                        } catch (e) {
                            console.error("Failed to create thread:", e);
                            continue;
                        }
                    }
                    
                    if (thread) {
                        server.discordThreadId = thread.id;
                        const fcmStatePath = path.join(process.cwd(), 'fcm-state.json');
                        const persistence = new JsonPersistenceManager(fcmStatePath);
                        persistence.saveState(appState.fcmHandler.state);
                    }
                }

                if (thread) {
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
        }
      },
      log: (msg) => console.log(`[FCM Log] ${msg}`)
    });
    appState.fcmHandler.start();
  } else {
    console.warn("FCM config missing. Skipping FCM Handler.");
  }
});

bot.on("interactionCreate", async (interaction: Interaction) => {
  if (interaction.isButton()) {
    console.log('FCM Handler State on button click:', appState.fcmHandler?.state);
    const customId = interaction.customId;

    if (customId.startsWith("pair-") || customId.startsWith("disconnect-") || customId.startsWith("remove-")) {
      const serverId = customId.substring(customId.indexOf('-') + 1);
      
      if (!appState.fcmHandler || !appState.fcmHandler.state.serverList[serverId]) {
        await interaction.reply({ content: "Server data not found. It might be stale.", flags: [64] });
        return;
      }

      const server = appState.fcmHandler.state.serverList[serverId];

      if (customId.startsWith("pair-")) {
        await interaction.deferUpdate();
        try {
          if (appState.rustPlus) {
            appState.rustPlus.disconnect();
          }

          const newRustPlus = new RustPlus(server.serverIp, server.appPort, server.steamId, server.playerToken);
          appState.rustPlus = newRustPlus;
          
          newRustPlus.on('connected', async () => {
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

          newRustPlus.on('error', async (e) => {
            console.error(`Failed to pair with ${server.title}:`, e);
            await interaction.followUp({ content: `Failed to connect: ${e.message}`, flags: [64] });
          });

          newRustPlus.connect();
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
                if (appState.rustPlus && appState.rustPlus.server === serverId.split('-')[0] && appState.rustPlus.port.toString() === serverId.split('-')[1]) {
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
      return; // Stop further processing
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
                    const server = state.serverList[targetServerId];
                    try {
                        if (appState.rustPlus) appState.rustPlus.disconnect();
                        
                        appState.rustPlus = new RustPlus(server.serverIp, server.appPort, server.steamId, server.playerToken);
                        appState.rustPlus.connect();
                        
                        await new Promise<void>((resolve, reject) => {
                            const t = setTimeout(() => reject(new Error("Timeout")), 5000);
                            appState.rustPlus!.once('connected', () => { clearTimeout(t); resolve(); });
                            appState.rustPlus!.once('error', (e) => { clearTimeout(t); reject(e); });
                        });
                    } catch (e: any) {
                        await interaction.reply({ content: `Failed to connect: ${e.message}`, flags: [64] });
                        return;
                    }
                 } else {
                     await interaction.reply({ content: "Not connected and cannot find server for this switch.", flags: [64] });
                     return;
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
                return;
            }

            const newState = !switchState.active;
            appState.rustPlus!.setEntityValue(entityId, newState, (response) => {
                if (!response.response.error) {
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
                        components.push(ActionRowBuilder.from(interaction.message.components[1]));
                    }

                    interaction.editReply({ embeds: [updatedEmbed], components: components });
                } else {
                    interaction.followUp({ content: `Error toggling switch: ${response.response.error.error}`, flags: [64] });
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
            return;

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
        return;
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

                const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    interaction.message.components[0].components.map(c => {
                        const newC = ButtonBuilder.from(c as ButtonBuilder);
                        if (newC.data.custom_id === customId) {
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
            return;
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
        return;
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

                const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    interaction.message.components[0].components.map(c => {
                        const newC = ButtonBuilder.from(c as ButtonBuilder);
                        if (newC.data.custom_id === customId) {
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
                return;
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
            return;
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

                const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    interaction.message.components[0].components.map(c => {
                        const newC = ButtonBuilder.from(c as ButtonBuilder);
                        if (newC.data.custom_id === customId) {
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
                return;
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
            return;
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
        return;
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

            if (interaction.guildId && appState.pairingChannels.has(interaction.guildId)) {
                const channel = appState.pairingChannels.get(interaction.guildId);
                const threadId = state.serverList[serverId!]?.discordThreadId;
                if (threadId) {
                    const thread = channel?.threads.cache.get(threadId);
                    if (thread) {
                        const messages = await thread.messages.fetch({ limit: 100 });
                        const messageToUpdate = messages.find(m => m.embeds[0]?.fields[0]?.value === entityId.toString());

                        if (messageToUpdate) {
                            const updatedEmbed = new EmbedBuilder(messageToUpdate.embeds[0].data).setTitle(newName);
                            await messageToUpdate.edit({ embeds: [updatedEmbed] });
                        }
                    }
                }
            }
            
            await interaction.editReply("Switch name updated successfully!");
        } else {
            await interaction.editReply("Could not find the switch to update.");
        }
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

            if (interaction.guildId && appState.pairingChannels.has(interaction.guildId)) {
                const channel = appState.pairingChannels.get(interaction.guildId);
                const threadId = state.serverList[serverId!]?.discordThreadId;
                if (threadId) {
                    const thread = channel?.threads.cache.get(threadId);
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
            }
            await interaction.editReply("Alarm updated successfully!");
        } else {
            await interaction.editReply("Could not find the alarm to update.");
        }
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

            if (interaction.guildId && appState.pairingChannels.has(interaction.guildId)) {
                const channel = appState.pairingChannels.get(interaction.guildId);
                const threadId = state.serverList[serverId!]?.discordThreadId;
                if (threadId) {
                    const thread = channel?.threads.cache.get(threadId);
                    if (thread) {
                        const messages = await thread.messages.fetch({ limit: 100 });
                        const messageToUpdate = messages.find(m => m.embeds[0]?.fields[0]?.value === entityId.toString());

                        if (messageToUpdate) {
                            const updatedEmbed = new EmbedBuilder(messageToUpdate.embeds[0].data).setTitle(newName);
                            await messageToUpdate.edit({ embeds: [updatedEmbed] });
                        }
                    }
                }
            }
            await interaction.editReply("Storage Monitor name updated successfully!");
        } else {
            await interaction.editReply("Could not find the storage monitor to update.");
        }
    }
  } else if (interaction.isStringSelectMenu()) {
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
                const selectComponent = row.components.find(c => c.type === ComponentType.StringSelect);
                if (selectComponent && (selectComponent as any).customId === interaction.customId) {
                        const newSelect = StringSelectMenuBuilder.from(selectComponent as any);
                        
                        const options = newSelect.options;
                        const selectedOption = options.find(o => o.value === selectedValue);
                        // Access label from data property if necessary, or directly if typed correctly. 
                        // StringSelectMenuOptionBuilder / APISelectMenuOption usually has label.
                        const newLabel = selectedOption ? selectedOption.data.label : 'OFF';
                        
                        newSelect.setPlaceholder(`AUTO SETTING: ${newLabel}`);
                        return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(newSelect);
                }
                return ActionRowBuilder.from(row as any);
            });

            await interaction.editReply({ embeds: [currentEmbed], components: newRows });
        } else {
                await interaction.followUp({ content: "Switch not found.", flags: [64] });
        }
    }
  }

  // If it's not one of our custom buttons or modals, let discordx handle it
  bot.executeInteraction(interaction);
});

bot.on("messageCreate", (message: Message) => {
  void bot.executeCommand(message);
});
