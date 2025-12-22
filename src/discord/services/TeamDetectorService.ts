import { SteamService, SteamPlayer } from "../../rustplus/services/SteamService";

export class TeamDetectorService {
    private steamService: SteamService;
    private maxDepth: number = 2; // Limit recursion depth to avoid infinite loops and API rate limits

    constructor() {
        this.steamService = new SteamService();
    }

    async detectTeam(targetSteamId: string, onlinePlayerNames: Set<string>): Promise<SteamPlayer[]> {
        const foundTeam: Map<string, SteamPlayer> = new Map(); // steamId -> Player
        const visited: Set<string> = new Set();

        // Add target to found team initially? Or just start searching?
        // Usually we want to find *others*.

        const recurse = async (currentId: string, depth: number) => {
            if (depth > this.maxDepth) return;
            if (visited.has(currentId)) return;
            visited.add(currentId);

            try {
                const friends = await this.steamService.getFriends(currentId);
                
                for (const friend of friends) {
                    if (friend.name && onlinePlayerNames.has(friend.name)) {
                        // This friend is online on the server
                        if (friend.steam_id && !foundTeam.has(friend.steam_id)) {
                            foundTeam.set(friend.steam_id, friend);
                            // Recurse to find friends of this friend who are also online
                            await recurse(friend.steam_id, depth + 1);
                        }
                    }
                }
            } catch (e) {
                console.error(`[TeamDetector] Error processing ${currentId}:`, e);
            }
        };

        await recurse(targetSteamId, 0);
        return Array.from(foundTeam.values());
    }
}
