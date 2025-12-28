import { ApplicationCommandOptionType, type CommandInteraction } from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { JsonPersistenceManager } from "../rustplus/PersistenceManager";
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
        flags: [64] // Ephemeral flag
    });
  }

  @Slash({ name: "clear_servers", description: "Clear all paired servers" })
  async clearServers(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
        const credentialsPath = path.join(process.cwd(), 'fcm-state.json');
        const persistence = new JsonPersistenceManager(credentialsPath);
        
        // Load current state to preserve other potential keys if any, 
        // but we specifically want to wipe server lists.
        const state = persistence.loadState();
        
        const count = Object.keys(state.serverList || {}).length;
        
        state.serverList = {};
        state.serverListLite = {};
        
        persistence.saveState(state);
        
        // Note: This does not disconnect active RustPlus instances in memory immediately
        // unless we access appState, but persistence is cleared.
        
        await interaction.editReply({ 
            content: `✅ Cleared ${count} paired servers from persistent state.` 
        });
    } catch (e: any) {
        console.error("Error clearing servers:", e);
        await interaction.editReply({ content: `❌ Error clearing servers: ${e.message}` });
    }
  }
}
