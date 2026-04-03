import fs from 'fs';
import path from 'path';

export interface BotConfig {
    ingamePrefix: string;
    replyCooldownSeconds: number;
    afkTimeoutSeconds: number;
    enableShopCommand: boolean;
    enableTeamChatLogging: boolean;
    enableDeathNotifications: boolean;
    enableWatchlistCommands: boolean;
    enableJoinLeaveNotifications: boolean;
    enableAfkNotifications: boolean;
    configAdminRoleId: string | null;
}

const DEFAULT_CONFIG: BotConfig = {
    ingamePrefix: '@',
    replyCooldownSeconds: 10,
    afkTimeoutSeconds: 300,
    enableShopCommand: true,
    enableTeamChatLogging: true,
    enableDeathNotifications: true,
    enableWatchlistCommands: true,
    enableJoinLeaveNotifications: true,
    enableAfkNotifications: true,
    configAdminRoleId: null
};

const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(dataDir, 'bot-config.json');

export class ConfigManager {
    private config: BotConfig;

    constructor() {
        this.config = this.load();
    }

    private load(): BotConfig {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
                return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
            }
        } catch (e) {
            console.error("Failed to load bot config:", e);
        }
        return { ...DEFAULT_CONFIG };
    }

    public save(): void {
        try {
            fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
        } catch (e) {
            console.error("Failed to save bot config:", e);
        }
    }

    public getConfig(): BotConfig {
        return this.config;
    }

    public updateConfig(updates: Partial<BotConfig>): void {
        this.config = { ...this.config, ...updates };
        this.save();
    }
}

export const configManager = new ConfigManager();
