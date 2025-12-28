import { ApplicationCommandOptionType, CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import { appState } from "../state/AppState";

@Discord()
@SlashGroup({ name: "shop", description: "Search Vending Machines" })
@SlashGroup("shop")
export class ShopCommand {
    @Slash({ name: "search", description: "Search for items in vending machines" })
    async search(
        @SlashOption({
            description: "Item name to search for",
            name: "item",
            required: true,
            type: ApplicationCommandOptionType.String
        })
        query: string,

        @SlashChoice("Buy", "buy")
        @SlashChoice("Sell", "sell")
        @SlashChoice("All", "all")
        @SlashOption({
            description: "Search filter (default: Sell)",
            name: "type",
            required: false,
            type: ApplicationCommandOptionType.String
        })
        orderType: 'buy' | 'sell' | 'all' = 'sell',

        interaction: CommandInteraction
    ): Promise<void> {
        await interaction.deferReply();

        if (!appState.rustPlus || !appState.rustPlus.isConnected()) {
            await interaction.editReply("❌ Not connected to a Rust server.");
            return;
        }

        if (!appState.vendingMachineService) {
            await interaction.editReply("❌ Vending Machine Service not initialized.");
            return;
        }

        try {
            // update markers first to get fresh stock
            const markersRes = await appState.rustPlus.sendRequestAsync({ getMapMarkers: {} });
            if (markersRes.mapMarkers) {
                appState.vendingMachineService.updateVendingMachines(markersRes.mapMarkers.markers);
            }

            // Need map size for grid
            // We can get it from info
            const infoRes = await appState.rustPlus.sendRequestAsync({ getInfo: {} });
            const mapSize = infoRes.info?.mapSize || 4500;

            const result = appState.vendingMachineService.search(query, mapSize, orderType);

            if ('error' in result && result.error) {
                await interaction.editReply(`❌ ${result.error}`);
                return;
            }

            const searchResult = result as { queryItem: string, results: any[] };

            if (searchResult.results.length === 0) {
                await interaction.editReply(`No results found for **${searchResult.queryItem}** (${orderType}).`);
                return;
            }

            // Sort by cost (ascending) or stock (descending)?
            // Default usually best deals first (cheapest cost)
            const sorted = searchResult.results.sort((a, b) => a.cost - b.cost);
            const top = sorted.slice(0, 10); // Limit to top 10 to avoid embed limits

            const embed = new EmbedBuilder()
                .setTitle(`Shop Search: ${searchResult.queryItem}`)
                .setColor(0x00FF00) // Green
                .setFooter({ text: `Found ${searchResult.results.length} offers. Showing top 10.` });

            let description = "";
            for (const offer of top) {
                const typeStr = orderType === 'buy' ? 'Buying' : 'Selling';
                // Grid [G15] | 100x Item for 20x Currency | Stock: 50
                // If selling: Selling 100x [Item] for 20x [Currency] at [Grid]
                
                // My logic in service returns: quantity (what is being sold/bought), cost (per item), currencyName
                // If orderType is 'sell', the VM is selling 'quantity' of 'itemName' for 'cost' of 'currencyName'.
                
                description += `**[${offer.grid || '???'}]** ${offer.quantity}x **${offer.itemName}** for ${offer.cost}x **${offer.currencyName}**\n`;
                description += `Stock: ${offer.amountInStock} | ${offer.isBlueprint ? 'Blueprint' : 'Item'}\n\n`;
            }

            embed.setDescription(description);
            await interaction.editReply({ embeds: [embed] });

        } catch (e: any) {
            console.error("Error searching shop:", e);
            await interaction.editReply(`❌ Error: ${e.message}`);
        }
    }
}
