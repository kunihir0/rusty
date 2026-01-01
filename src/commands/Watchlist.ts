import { ApplicationCommandOptionType, CommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { addToWatchList, removeFromWatchList, getWatchList, refreshDashboard, clearWatchList } from "../discord/services/BattlemetricsManager";

@Discord()
@SlashGroup({ name: "watchlist", description: "Manage MSS Watchlist" })
@SlashGroup("watchlist")
export class WatchlistCommands {
    @Slash({ name: "add", description: "Add a player to the MSS Watchlist by Steam ID" })
    async add(
        @SlashOption({
            description: "The Steam ID or Profile URL of the player",
            name: "steam_id",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        steamId: string,
        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await addToWatchList(steamId);
        await interaction.editReply({ content: result.message });
    }

    @Slash({ name: "remove", description: "Remove a player from the MSS Watchlist" })
    async remove(
        @SlashOption({
            description: "The Battlemetrics Name of the player (or BM ID)",
            name: "name_or_id",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        nameOrId: string,
        interaction: CommandInteraction
    ): Promise<void> {
        const removed = removeFromWatchList(nameOrId);
        if (removed) {
            await interaction.reply({ content: `🗑️ Removed **${nameOrId}** from the watchlist.`, flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: `❌ Player **${nameOrId}** not found in watchlist.`, flags: MessageFlags.Ephemeral });
        }
    }

    @Slash({ name: "clear", description: "Clear the entire watchlist" })
    async clear(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        clearWatchList();
        await interaction.editReply({ content: "🗑️ Watchlist has been cleared." });
    }

    @Slash({ name: "refresh", description: "Force refresh and rebuild the Watchlist Dashboard" })
    async refresh(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await refreshDashboard();
        await interaction.editReply({ content: "✅ Dashboard has been refreshed." });
    }

    @Slash({ name: "list", description: "List all watched players" })
    async list(interaction: CommandInteraction): Promise<void> {
        const list = getWatchList();
        if (list.size === 0) {
            await interaction.reply({ content: "The watchlist is empty.", flags: MessageFlags.Ephemeral });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("MSS Watchlist (Debug)")
            .setColor(0x0099FF)
            .setFooter({ text: "See the MSS Watchlist thread for the live dashboard." });

        let description = "";
        for (const entry of list.values()) {
            description += `• **${entry.name}** - [Steam](https://steamcommunity.com/profiles/${entry.steamId})\n`;
        }

        embed.setDescription(description.substring(0, 4096));
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}