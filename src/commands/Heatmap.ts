import { ApplicationCommandOptionType, AttachmentBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash, SlashChoice, SlashOption } from "discordx";
import { appState } from "../state/AppState";
import { deathHistory } from "../rustplus/DeathHistoryManager";

@Discord()
export class HeatmapCommand {
    @Slash({ name: "heatmap", description: "Generate a death heatmap" })
    async heatmap(
        @SlashChoice("Last 24 Hours", "24h")
        @SlashChoice("Last 3 Days", "3d")
        @SlashChoice("Last 7 Days", "7d")
        @SlashChoice("All Time", "all")
        @SlashOption({
            description: "Time range for the heatmap",
            name: "range",
            required: false,
            type: ApplicationCommandOptionType.String
        })
        range: string = "24h",

        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply();

        if (!appState.rustPlus || !appState.rustPlus.isConnected()) {
            await interaction.editReply("❌ Not connected to a Rust server.");
            return;
        }

        if (!appState.mapGenerator) {
            await interaction.editReply("❌ Map Generator not initialized.");
            return;
        }

        try {
            const mapRes = await appState.rustPlus.sendRequestAsync({ getMap: {} });
            
            if (!mapRes.map) {
                await interaction.editReply("❌ Failed to fetch map data.");
                return;
            }

            let sinceTimestamp = 0;
            const now = Date.now();

            if (range === '24h') sinceTimestamp = now - (24 * 60 * 60 * 1000);
            else if (range === '3d') sinceTimestamp = now - (3 * 24 * 60 * 60 * 1000);
            else if (range === '7d') sinceTimestamp = now - (7 * 24 * 60 * 60 * 1000);
            else if (range === 'all') sinceTimestamp = 0;

            const deaths = deathHistory.getDeaths(sinceTimestamp);

            if (deaths.length === 0) {
                await interaction.editReply(`No deaths recorded in the selected range (${range}).`);
                return;
            }

            const outputPath = await appState.mapGenerator.generateHeatmap(
                mapRes.map.jpgImage,
                deaths
            );

            const attachment = new AttachmentBuilder(outputPath, { name: 'heatmap.png' });
            const embed = new EmbedBuilder()
                .setTitle("Death Heatmap")
                .setDescription(`Showing ${deaths.length} deaths from range: **${range}**.`)
                .setImage("attachment://heatmap.png")
                .setColor(0xFF0000);

            await interaction.editReply({ embeds: [embed], files: [attachment] });

        } catch (e: any) {
            console.error("Error generating heatmap:", e);
            await interaction.editReply(`❌ Error generating heatmap: ${e.message}`);
        }
    }
}
