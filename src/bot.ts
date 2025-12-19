import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Colors, EmbedBuilder, IntentsBitField, TextChannel, type Interaction, type Message } from "discord.js";
import { Client } from "discordx";
import { RustPlus } from "./rustplus/ws";
import { createFcmHandler, FcmHandlerConfig } from "./rustplus/fcmHandler";
import { JsonPersistenceManager } from "./rustplus/PersistenceManager";
import path from "path";

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
      onEvent: (type, data) => {
        if (type === 'PAIRING_SERVER') {
          console.log('FCM Handler State after pairing event:', appState.fcmHandler?.state);
          for (const channel of appState.pairingChannels.values()) {
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

            void channel.send({ embeds: [serverEmbed], components: [row] });
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
    }
  }

  // If it's not one of our custom buttons, let discordx handle it
  bot.executeInteraction(interaction);
});

bot.on("messageCreate", (message: Message) => {
  void bot.executeCommand(message);
});
