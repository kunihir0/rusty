import { ChannelType, IntentsBitField, TextChannel, type Interaction, type Message } from "discord.js";
import { Client } from "discordx";
import { RustPlus } from "./rustplus/ws";
import { createFcmHandler } from "./rustplus/fcmHandler";
import { JsonPersistenceManager } from "./rustplus/PersistenceManager";
import path from "path";
import { appState } from "./state/AppState";
import { handleInteraction } from "./discord/interactions/InteractionHandler";
import { handleFcmEvent } from "./discord/services/fcmIntegration";
import { startBattlemetricsPolling } from "./discord/services/BattlemetricsManager";
import { onDiscordMessage } from "./discord/services/TeamChatBridge";
import { connectToRustServer } from "./discord/services/RustPlusManager";

import { ConfigurationService } from "./discord/services/ConfigurationService";

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

bot.once("clientReady", async () => {
  await bot.guilds.fetch();
  void bot.initApplicationCommands();
  console.log("Bot started");

  // Initialize Configuration Service
  appState.configService = new ConfigurationService(bot);
  await appState.configService.init();

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
export const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  const credentialsPath = path.join(dataDir, 'credentials.json');
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
    const persistenceManager = new JsonPersistenceManager(path.join(dataDir, 'fcm-state.json'));
    appState.fcmHandler = createFcmHandler({
      androidId: envAndroidId,
      securityToken: envSecurityToken,
      steamId: envPlayerId,
      persistenceManager,
      rustplus: appState.rustPlus,
      onEvent: handleFcmEvent,
      log: (msg) => console.log(`[FCM Log] ${msg}`)
    });
    appState.fcmHandler.start();
    
    // Start Battlemetrics Polling
    startBattlemetricsPolling();

    // Auto-connect to first saved server if not connected via Env Vars
    if (!appState.rustPlus) {
        const servers = Object.keys(appState.fcmHandler.state.serverList);
        if (servers.length > 0) {
            const lastServer = servers[servers.length - 1]; // Pick last added or arbitrary
            console.log(`[Auto-Connect] Connecting to saved server: ${appState.fcmHandler.state.serverList[lastServer].title}`);
            try {
                connectToRustServer(lastServer);
            } catch (e) {
                console.error("[Auto-Connect] Failed:", e);
            }
        }
    }
  } else {
    console.warn("FCM config missing. Skipping FCM Handler.");
  }
});

bot.on("interactionCreate", async (interaction: Interaction) => {
  // Handle custom interactions (Buttons, Modals, etc.)
  const handled = await handleInteraction(interaction);
  
  // Let discordx handle Slash Commands and Simple Commands if not handled
  if (!handled) {
      await bot.executeInteraction(interaction);
  }
});

bot.on("messageCreate", (message: Message) => {
  onDiscordMessage(message);
  void bot.executeCommand(message);
});