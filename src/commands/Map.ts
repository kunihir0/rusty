import { ApplicationCommandOptionType, AttachmentBuilder, CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { appState } from "../state/AppState";

@Discord()
export class MapCommand {
    @Slash({ name: "map", description: "Generate current server map" })
    async map(
        @SlashOption({
            description: "Show Monuments",
            name: "monuments",
            required: false,
            type: ApplicationCommandOptionType.Boolean
        })
        showMonuments: boolean = true,

        @SlashOption({
            description: "Show Markers (Players, Vending Machines, etc.)",
            name: "markers",
            required: false,
            type: ApplicationCommandOptionType.Boolean
        })
        showMarkers: boolean = true,

        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply();

        if (!appState.rustPlus || !appState.rustPlus.isConnected()) {
            await interaction.editReply("❌ Not connected to a Rust server.");
            return;
        }

        if (!appState.mapGenerator) {
            await interaction.editReply("❌ Map Generator not initialized (missing map data?).");
            return;
        }

        try {
            // Fetch fresh data
            // 1. Map Data (Base map cached, but monuments needed)
            //    Actually MapGenerator constructor doesn't take monuments. `generate` does.
            //    We can re-fetch map to get fresh monuments or use cached if we stored them.
            //    The extracted feature fetched `getMap` every time or cached raw jpg.
            //    Let's fetch `getMap` to be safe and get fresh monuments/jpg.
            const mapRes = await appState.rustPlus.sendRequestAsync({ getMap: {} });
            
            if (!mapRes.map) {
                await interaction.editReply("❌ Failed to fetch map data.");
                return;
            }

            // 2. Markers
            let markers: any[] = [];
            if (showMarkers) {
                const markersRes = await appState.rustPlus.sendRequestAsync({ getMapMarkers: {} });
                if (markersRes.mapMarkers) {
                    markers = markersRes.mapMarkers.markers;
                    // Update Vending Machine Service while we are at it
                    if (appState.vendingMachineService) {
                        appState.vendingMachineService.updateVendingMachines(markers);
                    }
                }
            }

            // Generate
            const outputPath = await appState.mapGenerator.generate(
                mapRes.map.jpgImage,
                showMonuments ? mapRes.map.monuments : [],
                markers
            );

            // Send
            const attachment = new AttachmentBuilder(outputPath, { name: 'map.png' });
            const embed = new EmbedBuilder()
                .setTitle("Server Map")
                .setImage("attachment://map.png")
                .setFooter({ text: `Monuments: ${showMonuments ? 'ON' : 'OFF'} | Markers: ${showMarkers ? 'ON' : 'OFF'}` });

            await interaction.editReply({ embeds: [embed], files: [attachment] });

        } catch (e: any) {
            console.error("Error generating map:", e);
            await interaction.editReply(`❌ Error generating map: ${e.message}`);
        }
    }
}
