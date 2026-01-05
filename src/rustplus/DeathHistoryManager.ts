import path from 'path';
import { JsonPersistenceManager } from './PersistenceManager';

export interface DeathRecord {
    x: number;
    y: number;
    name: string;
    steamId: string;
    timestamp: number;
}

export class DeathHistoryManager {
    private persistence: JsonPersistenceManager;
    private deaths: DeathRecord[] = [];
    private readonly MAX_HISTORY = 5000; // Limit history to prevent bloat

    constructor() {
        const filePath = path.join(process.cwd(), 'death-history.json');
        this.persistence = new JsonPersistenceManager(filePath);
        this.load();
    }

    private load() {
        const data = this.persistence.loadState();
        if (Array.isArray(data.deaths)) {
            this.deaths = data.deaths;
        }
    }

    public addDeath(record: DeathRecord) {
        this.deaths.push(record);
        if (this.deaths.length > this.MAX_HISTORY) {
            this.deaths.shift(); // Remove oldest
        }
        this.save();
    }

    public getDeaths(sinceTimestamp: number = 0): DeathRecord[] {
        return this.deaths.filter(d => d.timestamp >= sinceTimestamp);
    }

    public getLeaderboard(limit: number = 10): { name: string, count: number }[] {
        const counts: Record<string, { name: string, count: number }> = {};

        for (const death of this.deaths) {
            if (!counts[death.steamId]) {
                counts[death.steamId] = { name: death.name, count: 0 };
            }
            counts[death.steamId].count++;
            // Update name to latest
            counts[death.steamId].name = death.name;
        }

        return Object.values(counts)
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    public clear() {
        this.deaths = [];
        this.save();
    }

    private save() {
        this.persistence.saveState({ deaths: this.deaths });
    }
}

export const deathHistory = new DeathHistoryManager();
