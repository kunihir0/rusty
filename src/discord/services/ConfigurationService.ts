import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, Colors, EmbedBuilder, ModalBuilder, TextChannel, TextInputBuilder, TextInputStyle, Interaction, ModalSubmitInteraction, ButtonInteraction, MessageFlags, RoleSelectMenuBuilder } from "discord.js";
import { configManager } from "../../config/BotConfig";

export class ConfigurationService {
    private client: Client;
    private ownerId: string | null = null;

    constructor(client: Client) {
        this.client = client;
    }

    public async init() {
        // Fetch application to get owner ID
        if (!this.client.application?.owner) {
            await this.client.application?.fetch();
        }
        this.ownerId = this.client.application?.owner?.id || null;

        // Wait a bit for guilds to be ready if called immediately on startup
        for (const guild of this.client.guilds.cache.values()) {
            try {
                // Find or create category
                let category = guild.channels.cache.find(c => c.name === "伟大的" && c.type === ChannelType.GuildCategory);
                if (!category) {
                    category = await guild.channels.create({ name: "伟大的", type: ChannelType.GuildCategory });
                }

                let channel = guild.channels.cache.find(c => c.name === "configuration" && c.type === ChannelType.GuildText) as TextChannel;
                
                if (!channel) {
                    // Try finding by name in case cache missed (fetch)
                    const channels = await guild.channels.fetch();
                    channel = channels.find(c => c && c.name === "configuration" && c.type === ChannelType.GuildText) as TextChannel;
                }

                if (!channel) {
                    channel = await guild.channels.create({
                        name: "configuration",
                        type: ChannelType.GuildText,
                        topic: "Bot Configuration & Settings",
                        parent: category.id
                    });
                } else if (channel.parentId !== category.id) {
                    // Move to correct category if it exists but is misplaced
                    await channel.setParent(category.id);
                }

                await this.renderDashboard(channel);

            } catch (e) {
                console.error(`[ConfigService] Failed to init for guild ${guild.name}:`, e);
            }
        }
    }

    private async checkPermission(interaction: Interaction): Promise<boolean> {
        if (!this.ownerId) {
             if (!this.client.application?.owner) await this.client.application?.fetch();
             this.ownerId = this.client.application?.owner?.id || null;
        }

        if (interaction.user.id === this.ownerId) return true;

        const config = configManager.getConfig();
        if (config.configAdminRoleId && interaction.member) {
            const roles = interaction.member.roles;
            if (Array.isArray(roles)) {
                if (roles.includes(config.configAdminRoleId)) return true;
            } else if (roles && 'cache' in roles) {
                if (roles.cache.has(config.configAdminRoleId)) return true;
            }
        }

        return false;
    }

    public async renderDashboard(channel: TextChannel) {
        // Find existing dashboard message to edit, or send new
        // We look for the last message by the bot
        const messages = await channel.messages.fetch({ limit: 10 });
        const existingMsg = messages.find(m => m.author.id === this.client.user?.id);

        const config = configManager.getConfig();
        const adminRole = config.configAdminRoleId ? `<@&${config.configAdminRoleId}>` : "Only Bot Owner";

        const embed = new EmbedBuilder()
            .setTitle("⚙️ Bot Configuration")
            .setColor(Colors.DarkGrey)
            .setDescription("Manage global settings for the Rust+ Bot.")
            .addFields(
                { name: "In-Game Prefix", value: `\`${config.ingamePrefix}\``, inline: true },
                { name: "Reply Cooldown", value: `${config.replyCooldownSeconds} seconds`, inline: true },
                { name: "Admin Role", value: adminRole, inline: true },
                {
                    name: "Features", 
                    value: `Shop Cmd: ${config.enableShopCommand ? '✅' : '❌'}\nChat Log: ${config.enableTeamChatLogging ? '✅' : '❌'}\nDeath Notes: ${config.enableDeathNotifications ? '✅' : '❌'}\nWatchlist Cmd: ${config.enableWatchlistCommands ? '✅' : '❌'}\nJoin/Leave: ${config.enableJoinLeaveNotifications ? '✅' : '❌'}`, 
                    inline: false 
                }
            )
            .setFooter({ text: "Click buttons below to edit." });

        const row1 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder().setCustomId('config-prefix').setLabel('Change Prefix').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('config-cooldown').setLabel('Change Cooldown').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('config-refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
            );

        const row2 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('config-toggle-shop')
                    .setLabel(`Shop Cmd: ${config.enableShopCommand ? 'ON' : 'OFF'}`)
                    .setStyle(config.enableShopCommand ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config-toggle-chat')
                    .setLabel(`Chat Log: ${config.enableTeamChatLogging ? 'ON' : 'OFF'}`)
                    .setStyle(config.enableTeamChatLogging ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config-toggle-death')
                    .setLabel(`Death Notes: ${config.enableDeathNotifications ? 'ON' : 'OFF'}`)
                    .setStyle(config.enableDeathNotifications ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config-toggle-watchlist')
                    .setLabel(`Watchlist: ${config.enableWatchlistCommands ? 'ON' : 'OFF'}`)
                    .setStyle(config.enableWatchlistCommands ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('config-toggle-joinleave')
                    .setLabel(`Join/Leave: ${config.enableJoinLeaveNotifications ? 'ON' : 'OFF'}`)
                    .setStyle(config.enableJoinLeaveNotifications ? ButtonStyle.Success : ButtonStyle.Danger)
            );

        const row3 = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('config-role-select')
                    .setPlaceholder('Select Admin Role')
            );

        if (existingMsg) {
            await existingMsg.edit({ embeds: [embed], components: [row1, row2, row3] });
        } else {
            await channel.send({ embeds: [embed], components: [row1, row2, row3] });
        }
    }

    public async handleInteraction(interaction: Interaction): Promise<boolean> {
        if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isRoleSelectMenu()) return false;

        // Permission Check
        if (!await this.checkPermission(interaction)) {
            if (interaction.isRepliable()) {
                await interaction.reply({ content: "⛔ You do not have permission to modify bot settings.", flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (interaction.isRoleSelectMenu()) {
            if (interaction.customId === 'config-role-select') {
                const roleId = interaction.values[0];
                configManager.updateConfig({ configAdminRoleId: roleId });
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'config-refresh') {
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
            if (interaction.customId === 'config-toggle-shop') {
                const current = configManager.getConfig().enableShopCommand;
                configManager.updateConfig({ enableShopCommand: !current });
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
            if (interaction.customId === 'config-toggle-chat') {
                const current = configManager.getConfig().enableTeamChatLogging;
                configManager.updateConfig({ enableTeamChatLogging: !current });
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
            if (interaction.customId === 'config-toggle-death') {
                const current = configManager.getConfig().enableDeathNotifications;
                configManager.updateConfig({ enableDeathNotifications: !current });
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
            if (interaction.customId === 'config-toggle-watchlist') {
                const current = configManager.getConfig().enableWatchlistCommands;
                configManager.updateConfig({ enableWatchlistCommands: !current });
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
            if (interaction.customId === 'config-toggle-joinleave') {
                const current = configManager.getConfig().enableJoinLeaveNotifications;
                configManager.updateConfig({ enableJoinLeaveNotifications: !current });
                if (interaction.channel instanceof TextChannel) {
                    await interaction.deferUpdate();
                    await this.renderDashboard(interaction.channel);
                }
                return true;
            }
            if (interaction.customId === 'config-prefix') {
                const modal = new ModalBuilder()
                    .setTitle("Change Prefix")
                    .setCustomId("modal-config-prefix");
                
                const input = new TextInputBuilder()
                    .setCustomId("prefix-input")
                    .setLabel("New Prefix")
                    .setStyle(TextInputStyle.Short)
                    .setValue(configManager.getConfig().ingamePrefix)
                    .setRequired(true)
                    .setMaxLength(5);
                
                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await interaction.showModal(modal);
                return true;
            }
            if (interaction.customId === 'config-cooldown') {
                const modal = new ModalBuilder()
                    .setTitle("Change Cooldown")
                    .setCustomId("modal-config-cooldown");
                
                const input = new TextInputBuilder()
                    .setCustomId("cooldown-input")
                    .setLabel("Cooldown (seconds)")
                    .setStyle(TextInputStyle.Short)
                    .setValue(configManager.getConfig().replyCooldownSeconds.toString())
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await interaction.showModal(modal);
                return true;
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal-config-prefix') {
                const newPrefix = interaction.fields.getTextInputValue('prefix-input').trim();
                if (newPrefix) {
                    configManager.updateConfig({ ingamePrefix: newPrefix });
                    if (interaction.channel instanceof TextChannel) {
                        await interaction.deferUpdate();
                        await this.renderDashboard(interaction.channel);
                    } else {
                        await interaction.reply({ content: "Updated!", flags: MessageFlags.Ephemeral });
                    }
                }
                return true;
            }
            if (interaction.customId === 'modal-config-cooldown') {
                const val = parseInt(interaction.fields.getTextInputValue('cooldown-input'), 10);
                if (!isNaN(val) && val >= 0) {
                    configManager.updateConfig({ replyCooldownSeconds: val });
                    if (interaction.channel instanceof TextChannel) {
                        await interaction.deferUpdate();
                        await this.renderDashboard(interaction.channel);
                    } else {
                        await interaction.reply({ content: "Updated!", flags: MessageFlags.Ephemeral });
                    }
                } else {
                    await interaction.reply({ content: "Invalid number.", flags: MessageFlags.Ephemeral });
                }
                return true;
            }
        }

        return false;
    }
}
