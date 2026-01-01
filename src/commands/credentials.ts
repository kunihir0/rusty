import { ApplicationCommandOptionType, type CommandInteraction, MessageFlags } from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { JsonPersistenceManager } from "../rustplus/PersistenceManager";
import { appState } from "../state/AppState";
import path from "path";

@Discord()
@SlashGroup({ name: "credentials", description: "Manage credentials" })
@SlashGroup("credentials")
export class Credentials {
  @Slash({ name: "add", description: "Add new credentials" })
  async add(
    @SlashOption({
      description: "GCM Android ID",
      name: "gcm_android_id",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    androidId: string,

    @SlashOption({
      description: "GCM Security Token",
      name: "gcm_security_token",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    securityToken: string,

    @SlashOption({
      description: "Steam ID",
      name: "steam_id",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    steamId: string,

    @SlashOption({
      description: "Issued Date (Timestamp)",
      name: "issued_date",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    issuedDateStr: string,

    @SlashOption({
      description: "Expire Date (Timestamp)",
      name: "expire_date",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    expireDateStr: string,

    interaction: CommandInteraction
  ): Promise<void> {
    const issuedDate = parseInt(issuedDateStr, 10);
    const expireDate = parseInt(expireDateStr, 10);

    // Save credentials
    const credentialsPath = path.join(process.cwd(), 'credentials.json');
    const persistence = new JsonPersistenceManager(credentialsPath);
    
    persistence.saveState({
        androidId,
        securityToken,
        steamId,
        issuedDate,
        expireDate
    });

    console.log("Saved credentials:", {
        androidId,
        securityToken,
        steamId,
        issuedDate,
        expireDate
    });

    await interaction.reply({
        content: `Credentials added and saved for Steam ID: ${steamId}`,
        flags: MessageFlags.Ephemeral
    });
  }

  @Slash({ name: "clear_servers", description: "Clear all paired servers and threads" })
  async clearServers(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // 1. Disconnect Active Client
        if (appState.rustPlus) {
            appState.rustPlus.disconnect();
            appState.rustPlus = undefined;
        }

        // 2. Clear Persistence
        const credentialsPath = path.join(process.cwd(), 'fcm-state.json');
        const persistence = new JsonPersistenceManager(credentialsPath);
        
        let state;
        if (appState.fcmHandler) {
            // Use in-memory state as source of truth if available
            state = appState.fcmHandler.state;
        } else {
            // Fallback to disk
            state = persistence.loadState();
        }

        const serverCount = Object.keys(state.serverList || {}).length;

        state.serverList = {};
        state.serverListLite = {};
        
        persistence.saveState(state);

        // 3. Delete Threads
        let deletedThreads = 0;
        for (const channel of appState.pairingChannels.values()) {
            try {
                // Fetch active threads
                const active = await channel.threads.fetchActive();
                for (const thread of active.threads.values()) {
                    await thread.delete("Clear Servers Command");
                    deletedThreads++;
                }

                // Fetch archived threads
                const archived = await channel.threads.fetchArchived();
                for (const thread of archived.threads.values()) {
                    await thread.delete("Clear Servers Command");
                    deletedThreads++;
                }
                
                // 4. Clear Messages in Parent Channel (System messages like "Thread started")
                let fetched;
                do {
                    fetched = await channel.messages.fetch({ limit: 100 });
                    if (fetched.size > 0) {
                        // filterOld: true ensures we don't error on >14 day old messages
                        // For older messages that aren't deleted by bulkDelete, we manually delete them
                        const deleted = await channel.bulkDelete(fetched, true);
                        
                        if (deleted.size < fetched.size) {
                            // Some messages were too old for bulk delete, delete them manually
                            for (const msg of fetched.values()) {
                                if (!deleted.has(msg.id)) {
                                    await msg.delete().catch(() => {});
                                }
                            }
                        }
                    }
                } while (fetched.size >= 100); // Continue if we fetched a full batch

            } catch (err) {
                console.error(`Failed to cleanup channel ${channel.id}:`, err);
            }
        }
        
        await interaction.editReply({ 
            content: `✅ Cleared ${serverCount} paired servers, deleted ${deletedThreads} threads, and cleaned channel messages.` 
        });
    } catch (e: any) {
        console.error("Error clearing servers:", e);
        await interaction.editReply({ content: `❌ Error clearing servers: ${e.message}` });
    }
  }
}
