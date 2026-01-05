import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash } from "discordx";
import { deathHistory } from "../rustplus/DeathHistoryManager";

@Discord()
export class DeathLeaderboardCommand {
    @Slash({ name: "death_leaderboard", description: "Show the players with the most deaths" })
    async leaderboard(interaction: CommandInteraction): Promise<void> {
        const leaderboard = deathHistory.getLeaderboard(10);

        if (leaderboard.length === 0) {
            await interaction.reply({ content: "No death history recorded yet.", ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("💀 Death Leaderboard")
            .setColor(0xFF0000) // Red
            .setTimestamp();

        let description = "";
        let rank = 1;

        for (const entry of leaderboard) {
            let medal = "";
            if (rank === 1) medal = "🥇";
            else if (rank === 2) medal = "🥈";
            else if (rank === 3) medal = "🥉";
            else medal = `**#${rank}**`;

            description += `${medal} **${entry.name}** — ${entry.count} deaths\n`;
            rank++;
        }

        embed.setDescription(description);

        await interaction.reply({ embeds: [embed] });
    }
}
