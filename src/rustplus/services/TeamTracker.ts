import { AppTeamInfo } from "../../gen/rustplus_pb";
import * as MapUtils from "../utils/Map";

interface PlayerState {
    steamId: string;
    name: string;
    x: number;
    y: number;
    isAlive: boolean;
    isOnline: boolean;
    deathTime: number;
    spawnTime: number;
}

export interface DeathEvent {
    steamId: string;
    name: string;
    grid: string | null;
    x: number;
    y: number;
    deathTime: number;
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
     * @returns An array of death event objects.
     */
    public processTeamUpdate(teamInfo: AppTeamInfo): DeathEvent[] {
        const deathEvents: DeathEvent[] = [];

        for (const member of teamInfo.members) {
            const steamId = member.steamId.toString();
            const currentPlayerState: PlayerState = {
                steamId: steamId,
                name: member.name,
                x: member.x,
                y: member.y,
                isAlive: member.isAlive,
                isOnline: member.isOnline,
                deathTime: member.deathTime,
                spawnTime: member.spawnTime
            };

            // If we have seen this player before, check for state changes
            if (this.players.has(steamId)) {
                const previousState = this.players.get(steamId)!;

                // Debug: Log state comparison for active/alive changes
                if (previousState.isAlive !== currentPlayerState.isAlive || currentPlayerState.deathTime !== previousState.deathTime) {
                    console.log(`[TeamTracker] State Change for ${currentPlayerState.name}:`, 
                        `Alive: ${previousState.isAlive} -> ${currentPlayerState.isAlive}`,
                        `DeathTime: ${previousState.deathTime} -> ${currentPlayerState.deathTime}`
                    );
                }

                // Check for death
                // A player is dead if isAlive goes from true to false, OR if the deathTime timestamp updates (and is non-zero)
                const justDied = (previousState.isAlive && !currentPlayerState.isAlive) || 
                                 (currentPlayerState.deathTime !== previousState.deathTime && currentPlayerState.deathTime > 0);

                if (justDied) {
                    console.log(`[TeamTracker] Death detected: ${currentPlayerState.name} (${steamId}) at ${currentPlayerState.x},${currentPlayerState.y}`);
                    // Calculate grid location
                    // Use previous location if current is 0,0 (often happens on death) or null
                    // Note: In Rust+, dead players might have 0,0 or last known pos.
                    // We prioritize the one that isn't 0 if possible, or previous.
                    let x = currentPlayerState.x;
                    let y = currentPlayerState.y;

                    if (x === 0 && y === 0) {
                        x = previousState.x;
                        y = previousState.y;
                    }
                    
                    const pos = MapUtils.getPos(x, y, this.mapSize, null);

                    deathEvents.push({
                        steamId: steamId,
                        name: currentPlayerState.name,
                        grid: pos.location, // e.g., "G15"
                        x: x,
                        y: y,
                        deathTime: currentPlayerState.deathTime
                    });
                }
            }

            // Update stored state
            this.players.set(steamId, currentPlayerState);
        }

        return deathEvents;
    }
}
