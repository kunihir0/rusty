export const gridDiameter = 146.25;

interface Monument {
    token: string;
    x: number;
    y: number;
}

interface MonumentInfo {
    radius: number;
    clean: string;
}

interface RustPlusMap {
    monuments: Monument[];
    monumentInfo: Record<string, MonumentInfo>;
}

// Partial interface for what is used
export interface RustPlusInstance {
    guildId?: string; // It seems guildId is used but might be undefined in some contexts?
    map?: RustPlusMap;
    info?: { correctedMapSize: number };
    [key: string]: any;
}

interface PositionResult {
    location: string | null;
    monument: string | null;
    string: string | null;
    x: number;
    y: number;
}

/**
 * Calculate position string.
 * @param {number} x 
 * @param {number} y 
 * @param {number} mapSize 
 * @param {object} rustplus - Needs { map: { monuments: [], monumentInfo: {} } }
 * @param {function} intlGet - Optional localization function (key) => string
 * @returns 
 */
export function getPos(x: number, y: number, mapSize: number, rustplus: RustPlusInstance | null, intlGet?: (guildId: string | undefined, key: string) => string): PositionResult {
    // Mock intlGet if not provided
    if (!intlGet) {
        intlGet = (_guildId, key) => key;
    }

    const correctedMapSize = getCorrectedMapSize(mapSize);
    const pos: PositionResult = { location: null, monument: null, string: null, x: x, y: y };
    const guildId = rustplus?.guildId;

    if (isOutsideGridSystem(x, y, correctedMapSize)) {
        if (isOutsideRowOrColumn(x, y, correctedMapSize)) {
            if (x < 0 && y > correctedMapSize) {
                pos.location = intlGet(guildId, 'northWest');
            }
            else if (x < 0 && y < 0) {
                pos.location = intlGet(guildId, 'southWest');
            }
            else if (x > correctedMapSize && y > correctedMapSize) {
                pos.location = intlGet(guildId, 'northEast');
            }
            else {
                pos.location = intlGet(guildId, 'southEast');
            }
        }
        else {
            let str = '';
            if (x < 0 || x > correctedMapSize) {
                str += (x < 0) ? intlGet(guildId, 'westOfGrid') :
                    intlGet(guildId, 'eastOfGrid');
                str += ` ${getGridPosNumberY(y, correctedMapSize)}`;
            }
            else {
                str += (y < 0) ? intlGet(guildId, 'southOfGrid') :
                    intlGet(guildId, 'northOfGrid');
                str += ` ${getGridPosLettersX(x, correctedMapSize)}`;
            }
            pos.location = str;
        }
    }
    else {
        pos.location = getGridPos(x, y, mapSize);
    }

    if (rustplus && rustplus.map) {
        for (const monument of rustplus.map.monuments) {
            if (monument.token === 'DungeonBase' || !(monument.token in rustplus.map.monumentInfo)) continue;
            if (getDistance(x, y, monument.x, monument.y) <=
                rustplus.map.monumentInfo[monument.token].radius) {
                pos.monument = rustplus.map.monumentInfo[monument.token].clean;
                break;
            }
        }
    }

    pos.string = `${pos.location}${pos.monument !== null ? ` (${pos.monument})` : ''}`;

    return pos;
}

export function getGridPos(x: number, y: number, mapSize: number): string | null {
    const correctedMapSize = getCorrectedMapSize(mapSize);

    /* Outside the grid system */
    if (isOutsideGridSystem(x, y, correctedMapSize)) {
        return null;
    }

    const gridPosLetters = getGridPosLettersX(x, correctedMapSize);
    const gridPosNumber = getGridPosNumberY(y, correctedMapSize);

    return (gridPosLetters || '') + (gridPosNumber || '');
}

export function getGridPosLettersX(x: number, mapSize: number): string | undefined {
    let counter = 1;
    for (let startGrid = 0; startGrid < mapSize; startGrid += gridDiameter) {
        if (x >= startGrid && x <= (startGrid + gridDiameter)) {
            /* We're at the correct grid! */
            return numberToLetters(counter);
        }
        counter++;
    }
    return undefined;
}

export function getGridPosNumberY(y: number, mapSize: number): number | undefined {
    let counter = 1;
    const numberOfGrids = Math.floor(mapSize / gridDiameter);
    for (let startGrid = 0; startGrid < mapSize; startGrid += gridDiameter) {
        if (y >= startGrid && y <= (startGrid + gridDiameter)) {
            /* We're at the correct grid! */
            return numberOfGrids - counter;
        }
        counter++;
    }
    return undefined;
}

export function numberToLetters(num: number): string {
    const mod = num % 26;
    let pow = num / 26 | 0;
    const out = mod ? String.fromCharCode(64 + mod) : (pow--, 'Z');
    return pow ? numberToLetters(pow) + out : out;
}

export function getCorrectedMapSize(mapSize: number): number {
    const remainder = mapSize % gridDiameter;
    const offset = gridDiameter - remainder;
    return (remainder < 120) ? mapSize - remainder : mapSize + offset;
}

export function getAngleBetweenPoints(x1: number, y1: number, x2: number, y2: number): number {
    let angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

    if (angle < 0) {
        angle = 360 + angle;
    }

    return Math.floor((Math.abs(angle - 360) + 90) % 360);
}

export function getDistance(x1: number, y1: number, x2: number, y2: number): number {
    /* Pythagoras is the man! */
    const a = x1 - x2;
    const b = y1 - y2;
    return Math.sqrt(a * a + b * b);
}

export function isOutsideGridSystem(x: number, y: number, mapSize: number, offset: number = 0): boolean {
    if (x < -offset || x > (mapSize + offset) || y < -offset || y > (mapSize + offset)) {
        return true;
    }
    return false;
}

export function isOutsideRowOrColumn(x: number, y: number, mapSize: number): boolean {
    if ((x < 0 && y > mapSize) || (x < 0 && y < 0) || (x > mapSize && y > mapSize) || (x > mapSize && y < 0)) {
        return true;
    }
    return false;
}
