import path from 'path';
import { JsonPersistenceManager } from './PersistenceManager';

interface AfkPlayerStats {
    steamId: string;
    name: string;
    totalTime: number; // in milliseconds
}

export class AfkStatisticsManager {
    private persistence: JsonPersistenceManager;
    private stats: Map<string, AfkPlayerStats> = new Map();

    constructor() {
        const filePath = path.join(process.cwd(), 'afk-stats.json');
        this.persistence = new JsonPersistenceManager(filePath);
        this.load();
    }

    private load() {
        const data = this.persistence.loadState();
        if (data.players) {
            for (const [steamId, stat] of Object.entries(data.players)) {
                this.stats.set(steamId, stat as AfkPlayerStats);
            }
        }
    }

    private save() {
        const data = {
            players: Object.fromEntries(this.stats)
        };
        this.persistence.saveState(data);
    }

    public addAfkTime(steamId: string, name: string, timeSpent: number) {
        let stat = this.stats.get(steamId);
        if (!stat) {
            stat = { steamId, name, totalTime: 0 };
            this.stats.set(steamId, stat);
        }
        
        // Update name in case it changed
        stat.name = name;
        stat.totalTime += timeSpent;
        
        this.save();
    }

    public getLeaderboard(limit: number = 10): AfkPlayerStats[] {
        return Array.from(this.stats.values())
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, limit);
    }
}

export const afkStatistics = new AfkStatisticsManager();
