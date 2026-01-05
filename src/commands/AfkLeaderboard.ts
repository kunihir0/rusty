import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash } from "discordx";
import { afkStatistics } from "../rustplus/AfkStatisticsManager";

@Discord()
export class AfkLeaderboardCommand {
    @Slash({ name: "afk_leaderboard", description: "Show the top AFK players" })
    async leaderboard(interaction: CommandInteraction): Promise<void> {
        const leaderboard = afkStatistics.getLeaderboard(10);

        if (leaderboard.length === 0) {
            await interaction.reply({ content: "No AFK statistics recorded yet.", ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("😴 AFK Leaderboard")
            .setColor(0xFFA500) // Orange
            .setTimestamp();

        let description = "";
        let rank = 1;

        for (const entry of leaderboard) {
            const seconds = Math.floor(entry.totalTime / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            let timeStr = "";
            if (days > 0) timeStr += `${days}d `;
            if (hours % 24 > 0) timeStr += `${hours % 24}h `;
            if (minutes % 60 > 0) timeStr += `${minutes % 60}m`;
            if (timeStr === "") timeStr = `${seconds}s`;

            let medal = "";
            if (rank === 1) medal = "🥇";
            else if (rank === 2) medal = "🥈";
            else if (rank === 3) medal = "🥉";
            else medal = `**#${rank}**`;

            description += `${medal} **${entry.name}** — ${timeStr}\n`;
            rank++;
        }

        embed.setDescription(description);

        await interaction.reply({ embeds: [embed] });
    }
}
