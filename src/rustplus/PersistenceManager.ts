import fs from 'fs';
import path from 'path';

export class JsonPersistenceManager {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    public loadState(): any {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error(`Failed to load state from ${this.filePath}`, e);
        }
        return { serverList: {}, serverListLite: {} };
    }

    public saveState(state: any): void {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
        } catch (e) {
            console.error(`Failed to save state to ${this.filePath}`, e);
        }
    }
}
