import { AppTeamInfo } from "../../gen/rustplus_pb";
import * as MapUtils from "../utils/Map";
import { configManager } from "../../config/BotConfig";

interface PlayerState {
    steamId: string;
    name: string;
    x: number;
    y: number;
    isAlive: boolean;
    isOnline: boolean;
    deathTime: number;
    spawnTime: number;
    lastActiveTime: number;
    isAfk: boolean;
}

export interface DeathEvent {
    steamId: string;
    name: string;
    grid: string | null;
    x: number;
    y: number;
    deathTime: number;
}

export interface AfkEvent {
    steamId: string;
    name: string;
    isAfk: boolean;
    time: number;
    timeSpent?: number;
}

export class TeamTracker {
    private mapSize: number;
    private players: Map<string, PlayerState> = new Map();

    constructor(mapSize: number) {
        this.mapSize = mapSize;
    }

    public updateMapSize(mapSize: number) {
        this.mapSize = mapSize;
    }

    /**
     * Process a team update from Rust+.
     * @param teamInfo The raw teamInfo object from the Rust+ App.
     * @returns An object containing death events and afk events.
     */
    public processTeamUpdate(teamInfo: AppTeamInfo): { deaths: DeathEvent[], afk: AfkEvent[] } {
        const deathEvents: DeathEvent[] = [];
        const afkEvents: AfkEvent[] = [];
        const now = Date.now();

        for (const member of teamInfo.members) {
            const steamId = member.steamId.toString();
            
            let lastActiveTime = now;
            let isAfk = false;

            // If we have seen this player before, check for state changes
            if (this.players.has(steamId)) {
                const prev = this.players.get(steamId)!;
                
                // AFK Logic
                const hasMoved = member.x !== prev.x || member.y !== prev.y;
                const lifeChanged = member.isAlive !== prev.isAlive;
                const cameOnline = member.isOnline && !prev.isOnline;
                
                const isActive = hasMoved || lifeChanged || cameOnline;

                if (isActive) {
                    lastActiveTime = now;
                    if (prev.isAfk) {
                        // Returned from AFK
                        isAfk = false;
                        afkEvents.push({
                            steamId,
                            name: member.name,
                            isAfk: false,
                            time: now,
                            timeSpent: now - prev.lastActiveTime
                        });
                    }
                } else {
                    lastActiveTime = prev.lastActiveTime;
                    isAfk = prev.isAfk;

                    if (member.isOnline && !isAfk) {
                        const timeout = configManager.getConfig().afkTimeoutSeconds;
                        if (now - lastActiveTime > timeout * 1000) {
                            isAfk = true;
                            afkEvents.push({
                                steamId,
                                name: member.name,
                                isAfk: true,
                                time: now
                            });
                        }
                    } else if (!member.isOnline) {
                         isAfk = false; 
                    }
                }

                // Death Logic
                const justDied = (prev.isAlive && !member.isAlive) || 
                                 (member.deathTime !== prev.deathTime && member.deathTime > 0);

                if (justDied) {
                    console.log(`[TeamTracker] Death detected: ${member.name} (${steamId}) at ${member.x},${member.y}`);
                    let x = member.x;
                    let y = member.y;

                    if (x === 0 && y === 0) {
                        x = prev.x;
                        y = prev.y;
                    }
                    
                    const pos = MapUtils.getPos(x, y, this.mapSize, null);

                    deathEvents.push({
                        steamId: steamId,
                        name: member.name,
                        grid: pos.location,
                        x: x,
                        y: y,
                        deathTime: member.deathTime
                    });
                }
            }

            const newState: PlayerState = {
                steamId: steamId,
                name: member.name,
                x: member.x,
                y: member.y,
                isAlive: member.isAlive,
                isOnline: member.isOnline,
                deathTime: member.deathTime,
                spawnTime: member.spawnTime,
                lastActiveTime,
                isAfk
            };

            this.players.set(steamId, newState);
        }

        return { deaths: deathEvents, afk: afkEvents };
    }
}
