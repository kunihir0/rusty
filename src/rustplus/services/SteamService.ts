import * as cheerio from 'cheerio';

export interface SteamPlayer {
    steam_id: string | null;
    custom_id: string | null;
    name: string;
    type?: string;
}

export class SteamService {
    private steamProfiles: Map<string, string>; // steam_id -> content
    private steamProfilesFriends: Map<string, string>; // steam_id -> content
    private customIdTranslationTable: Map<string, string>; // custom_id -> steam_id

    constructor() {
        this.steamProfiles = new Map();
        this.steamProfilesFriends = new Map();
        this.customIdTranslationTable = new Map();
    }

    private log(message: string): void {
        // console.log(`[SteamService] ${message}`);
    }

    private async request(url: string): Promise<string> {
        if (!url) throw new Error('URL cannot be empty');
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            if (!response.ok) return '';
            return await response.text();
        } catch (error) {
            console.error(`[SteamService] Request failed: ${url}`, error);
            return '';
        }
    }

    private getUrlProfileBySteamId(steamId: string): string {
        return `https://steamcommunity.com/profiles/${steamId}/?l=english`;
    }

    private getUrlProfileByCustomId(customId: string): string {
        return `https://steamcommunity.com/id/${customId}/?l=english`;
    }

    private getUrlFriendsBySteamId(steamId: string): string {
        return `https://steamcommunity.com/profiles/${steamId}/friends/?l=english`;
    }

    private async getProfileContentBySteamId(steamId: string): Promise<string> {
        if (this.steamProfiles.has(steamId)) {
            return this.steamProfiles.get(steamId)!;
        }
        const content = await this.request(this.getUrlProfileBySteamId(steamId));
        if (content) this.steamProfiles.set(steamId, content);
        return content;
    }

    private async getProfileContentByCustomId(customId: string): Promise<string> {
        if (this.customIdTranslationTable.has(customId)) {
            const steamId = this.customIdTranslationTable.get(customId)!;
            if (this.steamProfiles.has(steamId)) {
                return this.steamProfiles.get(steamId)!;
            }
        }

        const content = await this.request(this.getUrlProfileByCustomId(customId));
        if (content) {
            const steamId = this.extractSteamId(content);
            if (steamId) {
                this.customIdTranslationTable.set(customId, steamId);
                if (!this.steamProfiles.has(steamId)) {
                    this.steamProfiles.set(steamId, content);
                }
            }
        }
        return content;
    }

    private async getFriendsContentBySteamId(steamId: string): Promise<string> {
        if (this.steamProfilesFriends.has(steamId)) {
            return this.steamProfilesFriends.get(steamId)!;
        }
        const content = await this.request(this.getUrlFriendsBySteamId(steamId));
        if (content) this.steamProfilesFriends.set(steamId, content);
        return content;
    }

    private extractSteamId(content: string): string {
        const regex = /,"steamid":"(.*?)",/m;
        const match = content.match(regex);
        return match ? match[1] : '';
    }

    private extractCustomId(content: string): string {
        const regex = /g_rgProfileData = {"url":"https:\/\/steamcommunity.com\/id\/(.*)\"/m;
        const match = content.match(regex);
        return match ? match[1] : '';
    }

    public async getSteamIdByCustomId(customId: string): Promise<string> {
        if (this.customIdTranslationTable.has(customId)) {
            return this.customIdTranslationTable.get(customId)!;
        }
        const content = await this.getProfileContentByCustomId(customId);
        return this.extractSteamId(content);
    }

    public async getCustomIdBySteamId(steamId: string): Promise<string> {
        for (const [key, value] of this.customIdTranslationTable.entries()) {
            if (value === steamId) return key;
        }
        const content = await this.getProfileContentBySteamId(steamId);
        return this.extractCustomId(content);
    }

    public async getProfileName(steamId: string): Promise<string> {
        const content = await this.getProfileContentBySteamId(steamId);
        const $ = cheerio.load(content);
        return $('.actual_persona_name').text() || 'Unknown';
    }

    public async getFriends(steamId: string): Promise<SteamPlayer[]> {
        const content = await this.getFriendsContentBySteamId(steamId);
        if (!content) return [];

        const $ = cheerio.load(content);
        const friends: SteamPlayer[] = [];

        $('.friend_block_v2').each((_, el) => {
            const block = $(el);
            const link = block.find('a.friend_block_link_overlay');
            const href = link.attr('href') || '';
            const friendSteamId = String(block.data('steamid') || '');
            
            let customId: string | null = null;
            const customIdMatch = href.match(/id\/(.+?)(\/|$)/);
            if (customIdMatch) {
                customId = customIdMatch[1] ?? null;
            }

            const contentDiv = block.find('.friend_block_content');
            let name = contentDiv.text().split('\n')[0]?.trim() || '';
            const clone = contentDiv.clone();
            clone.children().remove();
            const directText = clone.text().trim();
            if (directText) name = directText;

            if (friendSteamId) {
                if (customId && !this.customIdTranslationTable.has(customId)) {
                    this.customIdTranslationTable.set(customId, friendSteamId);
                }

                friends.push({
                    steam_id: friendSteamId,
                    custom_id: customId,
                    name: name,
                    type: 'friends'
                });
            }
        });

        return friends;
    }
}
