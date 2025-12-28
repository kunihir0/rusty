import sharp from 'sharp';
import path from 'path';
import { AppMap_Monument, AppMarker } from '../../gen/rustplus_pb';

export class MapGenerator {
    private mapSize: number;
    private oceanMargin: number;
    // Cache resized buffers for markers
    private markerBuffers: Record<string, Buffer> = {};
    
    private resourcesPath: string;
    private outputPath: string;

    constructor(mapSize: number, oceanMargin: number) {
        this.mapSize = mapSize;
        this.oceanMargin = oceanMargin;
        this.resourcesPath = path.join(process.cwd(), 'src', 'rustplus', 'resources');
        this.outputPath = path.join(process.cwd(), 'map_full.png');
    }

    public async init() {
        const markerTypes = {
            'player': { file: 'markers/player.png', w: 20, h: 20 },
            'shop': { file: 'markers/shop.png', w: 20, h: 20 },
            'chinook': { file: 'markers/chinook.png', w: 50, h: 50 },
            'cargo': { file: 'markers/cargo.png', w: 100, h: 100 },
            'heli': { file: 'markers/heli.png', w: 20, h: 20 },
            'tunnels': { file: 'markers/tunnels.png', w: 20, h: 20 },
            'tunnels_link': { file: 'markers/tunnels_link.png', w: 20, h: 20 },
            'explosion': { file: 'events/death_logo.png', w: 30, h: 30 }
        };

        for (const [key, config] of Object.entries(markerTypes)) {
            try {
                const imagePath = path.join(this.resourcesPath, 'images', config.file);
                // Pre-resize and store buffer
                this.markerBuffers[key] = await sharp(imagePath)
                    .resize(config.w, config.h)
                    .toBuffer();
            } catch (err: any) {
                console.warn(`Failed to load image for ${key}: ${err.message}`);
            }
        }
    }

    /**
     * Generates the map image.
     * @param rawJpgData The raw JPG map data from Rust+.
     * @param monuments Array of monument objects.
     * @param markers Array of map markers (vending machines, players, etc.).
     */
    public async generate(rawJpgData: Uint8Array, monuments: AppMap_Monument[], markers: AppMarker[]): Promise<string> {
        if (Object.keys(this.markerBuffers).length === 0) await this.init();

        // 1. Load Base Map
        const baseMap = sharp(Buffer.from(rawJpgData));
        const metadata = await baseMap.metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        const composites: sharp.OverlayOptions[] = [];

        // 2. Prepare Monument Text (SVG Overlay)
        if (monuments && monuments.length > 0) {
            let svgContent = `<svg width="${width}" height="${height}">
            <style>
                .text { fill: white; font-family: sans-serif; font-weight: bold; font-size: 14px; text-anchor: middle; stroke: black; stroke-width: 1px; }
            </style>`;
            
            for (const mon of monuments) {
                if (mon.token === 'DungeonBase') continue;
                const { x, y } = this.gameToImageXY(mon.x, mon.y, width, height);
                // Basic XML escaping for token
                const safeToken = mon.token.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                svgContent += `<text x="${x}" y="${y}" class="text">${safeToken}</text>`;
            }
            svgContent += `</svg>`;
            
            composites.push({
                input: Buffer.from(svgContent),
                top: 0,
                left: 0
            });
        }

        // 3. Prepare Markers
        if (markers && markers.length > 0) {
            for (const marker of markers) {
                const { x, y } = this.gameToImageXY(marker.x, marker.y, width, height);
                let buffer: Buffer | null = null;
                let w = 20; // Default size used for centering offset
                let h = 20;

                switch (marker.type) {
                    case 1: buffer = this.markerBuffers['player']; break;
                    case 2: buffer = this.markerBuffers['explosion']; w=30; h=30; break;
                    case 3: buffer = this.markerBuffers['shop']; break;
                    case 4: buffer = this.markerBuffers['chinook']; w=50; h=50; break;
                    case 5: buffer = this.markerBuffers['cargo']; w=100; h=100; break;
                    case 8: buffer = this.markerBuffers['heli']; break;
                }

                if (buffer) {
                    let finalBuffer = buffer;
                    // Rotation handling
                    if (marker.rotation) {
                         try {
                             finalBuffer = await sharp(buffer)
                                .rotate(-marker.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
                                .toBuffer();
                             
                             // Update dimensions if rotated (approximated for now as checking metadata is async/slow inside loop)
                             // For squares (most icons), center remains roughly center.
                         } catch (e) {
                             // Fallback to unrotated if error
                         }
                    }

                    composites.push({
                        input: finalBuffer,
                        left: Math.round(x - (w / 2)),
                        top: Math.round(y - (h / 2))
                    });
                }
            }
        }

        // 4. Composite & Save
        await baseMap
            .composite(composites)
            .toFile(this.outputPath);

        return this.outputPath;
    }

    private gameToImageXY(gameX: number, gameY: number, imgW: number, imgH: number) {
        // Rust map coordinate conversion
        const activeWidth = imgW - (2 * this.oceanMargin);
        const ratio = activeWidth / this.mapSize;

        const x = (gameX * ratio) + this.oceanMargin;
        const y = imgH - (gameY * ratio) - this.oceanMargin;

        return { x, y };
    }
}
