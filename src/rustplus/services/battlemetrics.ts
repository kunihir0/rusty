import RandomUsernames from '../staticFiles/RandomUsernames.json';
import * as Utils from '../utils/Utils';

const SERVER_LOG_SIZE = 1000;
const CONNECTION_LOG_SIZE = 1000;
const PLAYER_CONNECTION_LOG_SIZE = 100;
const NAME_CHANGE_LOG_SIZE = 100;

export interface BattlemetricsClient {
    id: number | null;
    name: string | null;
    data: any;
    ready: boolean;
    updatedAt: string | null;
    lastUpdateSuccessful: boolean | null;
    rustmapsAvailable: boolean | null;
    streamerMode: boolean;
    serverLog: any[];
    connectionLog: any[];
    players: Record<string, any>;
    newPlayers: any[];
    loginPlayers: any[];
    logoutPlayers: any[];
    nameChangedPlayers: any[];
    onlinePlayers: any[];
    offlinePlayers: any[];
    serverEvaluation: any;

    // Server params
    server_name: string | null;
    server_address: string | null;
    server_ip: string | null;
    server_port: number | null;
    
    // Methods
    request: (api_call: string, options?: any) => Promise<any>;
    setup: () => Promise<void>;
    updateStreamerMode: () => Promise<void>;
    getServerIdFromName: (name: string) => Promise<number | null>;
    getPlayerIdFromSteamId: (steamId: string) => Promise<{id: number, name: string} | null>;
    getProfileData: (playerId: string | number) => Promise<any[]>;
    evaluation: (data?: any, firstTime?: boolean) => Promise<boolean | null>;
    getOnlineTime: (playerId: string) => [number, string] | null;
    getOfflineTime: (playerId: string) => [number, string] | null;
    getOnlinePlayerIdsOrderedByTime: () => string[];
    getOfflinePlayerIdsOrderedByLeastTimeSinceOnline: () => string[];
    
    // API Call generators
    SEARCH_SERVER_NAME_API_CALL: (name: string) => string;
    GET_SERVER_DATA_API_CALL: (id: number) => string;
    GET_PROFILE_DATA_API_CALL: (id: number | string) => string;
    GET_SERVER_MOST_TIME_PLAYED_API_CALL: (id: number, days?: number | null) => string;
    GET_BATTLEMETRICS_PLAYER_URL: (id: number | string) => string;

    // Dynamic properties access
    [key: string]: any;
}

export function createBattlemetricsClient(initialId: number | null, initialName: string | null): BattlemetricsClient {
    let _id = initialId;
    let _name = initialName;
    let _data: any = null;
    let _ready = false;
    let _updatedAt: string | null = null;
    let _lastUpdateSuccessful: boolean | null = null;
    let _rustmapsAvailable: boolean | null = null;
    let _streamerMode = true;
    let _serverLog: any[] = [];
    let _connectionLog: any[] = [];
    let _players: Record<string, any> = {};

    let _newPlayers: any[] = [];
    let _loginPlayers: any[] = [];
    let _logoutPlayers: any[] = [];
    let _nameChangedPlayers: any[] = [];
    let _onlinePlayers: any[] = [];
    let _offlinePlayers: any[] = [];

    let _serverEvaluation: any = {};

    // Server params container
    const serverParams: any = {
        server_name: null,
        server_address: null,
        server_ip: null,
        server_port: null,
        server_players: null,
        server_maxPlayers: null,
        server_rank: null,
        server_location: null,
        server_status: null,
        server_private: null,
        server_createdAt: null,
        server_updatedAt: null,
        server_portQuery: null,
        server_country: null,
        server_queryStatus: null,
        server_official: null,
        server_rust_type: null,
        server_map: null,
        server_environment: null,
        server_rust_build: null,
        server_rust_ent_cnt_i: null,
        server_rust_fps: null,
        server_rust_fps_avg: null,
        server_rust_gc_cl: null,
        server_rust_gc_mb: null,
        server_rust_hash: null,
        server_rust_headerimage: null,
        server_rust_mem_pv: null,
        server_rust_mem_ws: null,
        server_pve: null,
        server_rust_uptime: null,
        server_rust_url: null,
        server_rust_world_seed: null,
        server_rust_world_size: null,
        server_rust_description: null,
        server_rust_modded: null,
        server_rust_queued_players: null,
        server_rust_gamemode: null,
        server_rust_born: null,
        server_rust_last_seed_change: null,
        server_rust_last_wipe: null,
        server_rust_last_wipe_ent: null,
        server_serverSteamId: null,
        map_url: null,
        map_thumbnailUrl: null,
        map_monuments: null,
        map_barren: null,
        map_updatedAt: null,
    };

    // API Call Generators
    function SEARCH_SERVER_NAME_API_CALL(name: string) {
        return `https://api.battlemetrics.com/servers?filter[search]=${name}&filter[game]=rust`;
    }

    function SEARCH_PLAYER_API_CALL(search: string) {
        return `https://api.battlemetrics.com/players?filter[search]=${search}&include=identifier&page[size]=10`;
    }

    function MATCH_PLAYER_API_CALL() {
        return `https://api.battlemetrics.com/players/match`;
    }

    function GET_SERVER_DATA_API_CALL(id: number) {
        return `https://api.battlemetrics.com/servers/${id}?include=player`;
    }

    function GET_PROFILE_DATA_API_CALL(id: number | string) {
        return `https://api.battlemetrics.com/players/${id}?include=identifier`;
    }

    function GET_SERVER_MOST_TIME_PLAYED_API_CALL(id: number, days: number | null = null) {
        let period = 'AT'; /* All-time if days are not provided */
        if (days !== null) {
            const now = new Date().toISOString();
            const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            period = `${daysAgo}:${now}`
        }
        return `https://api.battlemetrics.com/servers/${id}/relationships/leaderboards/time?filter[period]=${period}`;
    }

    function GET_BATTLEMETRICS_PLAYER_URL(id: number | string) {
        return `https://www.battlemetrics.com/players/${id}`;
    }

    // REPLACED AXIOS WITH FETCH
    async function _request(api_call: string, options: any = {}) {
        try {
            const token = process.env.BATTLEMETRICS_TOKEN;
            const headers = options.headers || {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            // Add JSON content type for POST if not set
            if (options.method === 'POST' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }

            const response = await fetch(api_call, { ...options, headers });
            const data = await response.json().catch(() => null);

            return {
                status: response.status,
                data: data
            };
        }
        catch (e) {
            console.error("[Battlemetrics] Request Error:", e);
            return null;
        }
    }

    function _parseMostTimePlayedApiResponse(data: any) {
        const parsed: any = {};
        parsed['players'] = [];

        for (const entity of data.data) {
            if (entity.type !== 'leaderboardPlayer') continue;

            const player: any = {};
            player['id'] = entity.id;
            player['name'] = Utils.removeInvisibleCharacters(entity.attributes.name);
            player['time'] = entity.attributes.value;
            player['rank'] = entity.attributes.rank;
            player['url'] = GET_BATTLEMETRICS_PLAYER_URL(entity.id);

            parsed['players'].push(player);
        }

        if (data.hasOwnProperty('links') && data['links'].hasOwnProperty('next')) {
            parsed['next'] = data.links.next;
        }

        return parsed;
    }

    function _parseProfileDataApiResponse(data: any) {
        const parsed: any[] = [];

        for (const name of data.included) {
            if (name.type !== 'identifier') continue;
            if (!name.hasOwnProperty('attributes')) continue;
            if (!name['attributes'].hasOwnProperty('type')) continue;
            if (name['attributes']['type'] !== 'name') continue;
            if (!name['attributes'].hasOwnProperty('identifier')) continue;
            if (!name['attributes'].hasOwnProperty('lastSeen')) continue;

            parsed.push({
                'name': name['attributes']['identifier'],
                'lastSeen': name['attributes']['lastSeen']
            });
        }

        return parsed;
    }

    function _updateServerLog(data: any) {
        if (_serverLog.length === SERVER_LOG_SIZE) {
            _serverLog.pop();
        }
        _serverLog.unshift(data);
    }

    function _updateConnectionLog(id: string, data: any) {
        if (!_players.hasOwnProperty(id)) return;

        if (_players[id]['connectionLog'].length === PLAYER_CONNECTION_LOG_SIZE) {
            _players[id]['connectionLog'].pop();
        }
        _players[id]['connectionLog'].unshift(data);

        /* Add to server connection log of all players */
        if (_connectionLog.length === CONNECTION_LOG_SIZE) {
            _connectionLog.pop();
        }
        _connectionLog.unshift({ id: id, data: data });
    }

    function _updateNameChangeHistory(id: string, data: any) {
        if (!_players.hasOwnProperty(id)) return;

        if (_players[id]['nameChangeHistory'].length === NAME_CHANGE_LOG_SIZE) {
            _players[id]['nameChangeHistory'].pop();
        }
        _players[id]['nameChangeHistory'].unshift(data);
    }

    function _evaluateServerParameter(key: string, value1: any, value2: any, firstTime: boolean) {
        if (firstTime) return;

        let isDifferent = false;
        if (Array.isArray(value1) || Array.isArray(value2)) {
            if (value1.length != value2.length || !value1.every(function (u: any, i: number) { return u === value2[i] })) {
                isDifferent = true;
            }
        }
        else {
            if (value1 !== value2) {
                isDifferent = true;
            }
        }

        if (isDifferent) {
            _serverEvaluation[key] = { from: value1, to: value2 }

            const time = new Date().toISOString();
            _updateServerLog({ key: key, from: value1, to: value2, time: time });
        }
    }

    function _formatTime(timestamp: string): [number, string] {
        const date = new Date(timestamp);
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs / (1000 * 60)) % 60);
        const hoursStr = diffHours.toString().padStart(2, '0');
        const minutesStr = diffMinutes.toString().padStart(2, '0');
        return [Math.floor(diffMs / 1000), `${hoursStr}:${minutesStr}`];
    }

    // Public Methods

    async function request(api_call: string, options: any = {}) {
        if (_id === null) return null;

        const response = await _request(api_call, options);

        if (!response || !response.status || response.status !== 200) {
            console.error(`Battlemetrics API request failed: ${api_call}`);
            return null;
        }

        return response.data;
    }

    async function setup() {
        if (_id === null && _name === null) {
            console.error('Battlemetrics ID and Name missing');
            return;
        }

        if (_id === null && _name !== null) {
            _id = await getServerIdFromName(_name);
            if (!_id) return;
        }

        await updateStreamerMode();

        _lastUpdateSuccessful = true;
        await evaluation(null, true);
    }

    async function updateStreamerMode() {
        if (_id === null) return;
        const data = await request(GET_SERVER_MOST_TIME_PLAYED_API_CALL(_id, 30));
        if (!data) return;

        const parsed = _parseMostTimePlayedApiResponse(data);
        for (const player of parsed.players) {
            const randomUsernames: string[] = (RandomUsernames as any).RandomUsernames;
            if (!randomUsernames.includes(player.name)) _streamerMode = false;
        }
    }

    async function getServerIdFromName(name: string): Promise<number | null> {
        const originalName = name;
        name = encodeURI(name).replace('\#', '\*');
        const search = SEARCH_SERVER_NAME_API_CALL(name);
        const response = await _request(search);

        if (!response || !response.status || response.status !== 200) {
            console.error(`Battlemetrics API request failed: ${search}`);
            return null;
        }

        /* Find the correct server. */
        for (const server of response.data.data) {
            if (server.attributes.name === originalName) {
                return server.id;
            }
        }

        return null;
    }

    async function getPlayerIdFromSteamId(steamId: string, playerName?: string): Promise<{id: number, name: string} | null> {
        // Try exact match first using POST /players/match
        const matchUrl = MATCH_PLAYER_API_CALL();
        const body = {
            data: [
                {
                    type: "identifier",
                    attributes: {
                        type: "steamID",
                        identifier: steamId
                    }
                }
            ]
        };

        console.log(`[Battlemetrics] Matching SteamID: ${steamId}`);
        const matchResponse = await _request(matchUrl, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (matchResponse && matchResponse.status === 200 && matchResponse.data && matchResponse.data.data) {
             const data = matchResponse.data.data;
             if (data.length > 0) {
                 const player = data[0];
                 console.log(`[Battlemetrics] Match Found: ${player.attributes.name} (${player.id})`);
                 return {
                     id: parseInt(player.id),
                     name: player.attributes.name
                 };
             } else {
                 console.log(`[Battlemetrics] No match found for ${steamId}`);
             }
        } else {
             console.log(`[Battlemetrics] Match failed status: ${matchResponse?.status}`);
        }

        // Fallback to Search ID
        console.log(`[Battlemetrics] Fallback to Search for ID: ${steamId}`);
        const search = SEARCH_PLAYER_API_CALL(steamId);
        const response = await _request(search);

        if (response && response.status === 200 && response.data && response.data.data && response.data.data.length > 0) {
            const player = response.data.data[0];
            console.log(`[Battlemetrics] Found via Search ID: ${player.attributes.name} (${player.id})`);
            return {
                id: parseInt(player.id),
                name: player.attributes.name
            };
        }

        // Fallback to Search Name
        if (playerName) {
            console.log(`[Battlemetrics] Fallback to Search for Name: ${playerName}`);
            const searchName = SEARCH_PLAYER_API_CALL(encodeURIComponent(playerName));
            const responseName = await _request(searchName);
            
            if (responseName && responseName.status === 200 && responseName.data && responseName.data.data && responseName.data.data.length > 0) {
                // Try to find exact name match
                for (const p of responseName.data.data) {
                    if (p.attributes.name === playerName) {
                         console.log(`[Battlemetrics] Found via Name Exact Match: ${p.attributes.name} (${p.id})`);
                         return {
                            id: parseInt(p.id),
                            name: p.attributes.name
                        };
                    }
                }
                const player = responseName.data.data[0];
                console.log(`[Battlemetrics] Found via Name Search (Best Guess): ${player.attributes.name} (${player.id})`);
                return {
                    id: parseInt(player.id),
                    name: player.attributes.name
                };
            }
        }

        return null;
    }

    async function getProfileData(playerId: string | number) {
        const data = await request(GET_PROFILE_DATA_API_CALL(playerId));
        if (!data) return [];

        return _parseProfileDataApiResponse(data);
    }

    async function evaluation(data: any = null, firstTime = false) {
        if (_id === null) return null;

        if (data === null) {
            data = await request(GET_SERVER_DATA_API_CALL(_id));
        }

        if (!data) {
            _lastUpdateSuccessful = false;
            console.error(`Battlemetrics failed to update server: ${_id}`);
            return false;
        }

        _lastUpdateSuccessful = true;
        _data = data;

        const time = new Date().toISOString();
        _updatedAt = time;

        /* Server parameter evaluation */

        const attributes = data.data.attributes;
        _serverEvaluation = {};
        _evaluateServerParameter('server_name', serverParams.server_name, attributes.name, firstTime);
        _evaluateServerParameter('server_address', serverParams.server_address, attributes.address, firstTime);
        _evaluateServerParameter('server_ip', serverParams.server_ip, attributes.ip, firstTime);
        _evaluateServerParameter('server_port', serverParams.server_port, attributes.port, firstTime);
        _evaluateServerParameter('server_players', serverParams.server_players, attributes.players, firstTime);
        _evaluateServerParameter('server_maxPlayers', serverParams.server_maxPlayers, attributes.maxPlayers, firstTime);
        _evaluateServerParameter('server_rank', serverParams.server_rank, attributes.rank, firstTime);
        _evaluateServerParameter('server_location', serverParams.server_location, attributes.location, firstTime);
        _evaluateServerParameter('server_status', serverParams.server_status, attributes.status, firstTime);
        _evaluateServerParameter('server_private', serverParams.server_private, attributes.private, firstTime);
        _evaluateServerParameter('server_createdAt', serverParams.server_createdAt, attributes.createdAt, firstTime);
        _evaluateServerParameter('server_updatedAt', serverParams.server_updatedAt, attributes.updatedAt, firstTime);
        _evaluateServerParameter('server_portQuery', serverParams.server_portQuery, attributes.portQuery, firstTime);
        _evaluateServerParameter('server_country', serverParams.server_country, attributes.country, firstTime);
        _evaluateServerParameter('server_queryStatus', serverParams.server_queryStatus, attributes.queryStatus, firstTime);

        const details = attributes.details;
        _evaluateServerParameter('server_official', serverParams.server_official, details.official, firstTime);
        _evaluateServerParameter('server_rust_type', serverParams.server_rust_type, details.rust_type, firstTime);
        _evaluateServerParameter('server_map', serverParams.server_map, details.map, firstTime);
        _evaluateServerParameter('server_environment', serverParams.server_environment, details.environment, firstTime);
        _evaluateServerParameter('server_rust_build', serverParams.server_rust_build, details.rust_build, firstTime);
        _evaluateServerParameter('server_rust_ent_cnt_i', serverParams.server_rust_ent_cnt_i,
            details.rust_ent_cnt_i, firstTime);
        _evaluateServerParameter('server_rust_fps', serverParams.server_rust_fps, details.rust_fps, firstTime);
        _evaluateServerParameter('server_rust_fps_avg', serverParams.server_rust_fps_avg, details.rust_fps_avg, firstTime);
        _evaluateServerParameter('server_rust_gc_cl', serverParams.server_rust_gc_cl, details.rust_gc_cl, firstTime);
        _evaluateServerParameter('server_rust_gc_mb', serverParams.server_rust_gc_mb, details.rust_gc_mb, firstTime);
        _evaluateServerParameter('server_rust_hash', serverParams.server_rust_hash, details.rust_hash, firstTime);
        _evaluateServerParameter('server_rust_headerimage', serverParams.server_rust_headerimage,
            details.rust_headerimage, firstTime);
        _evaluateServerParameter('server_rust_mem_pv', serverParams.server_rust_mem_pv, details.rust_mem_pv, firstTime);
        _evaluateServerParameter('server_rust_mem_ws', serverParams.server_rust_mem_ws, details.rust_mem_ws, firstTime);
        _evaluateServerParameter('server_pve', serverParams.server_pve, details.pve, firstTime);
        _evaluateServerParameter('server_rust_uptime', serverParams.server_rust_uptime, details.rust_uptime, firstTime);
        _evaluateServerParameter('server_rust_url', serverParams.server_rust_url, details.rust_url, firstTime);
        _evaluateServerParameter('server_rust_world_seed', serverParams.server_rust_world_seed,
            details.rust_world_seed, firstTime);
        _evaluateServerParameter('server_rust_world_size', serverParams.server_rust_world_size,
            details.rust_world_size, firstTime);
        _evaluateServerParameter('server_rust_description', serverParams.server_rust_description,
            details.rust_description, firstTime);
        _evaluateServerParameter('server_rust_modded', serverParams.server_rust_modded, details.rust_modded, firstTime);
        _evaluateServerParameter('server_rust_queued_players', serverParams.server_rust_queued_players,
            details.rust_queued_players, firstTime);
        _evaluateServerParameter('server_rust_gamemode', serverParams.server_rust_gamemode,
            details.rust_gamemode, firstTime);
        _evaluateServerParameter('server_rust_born', serverParams.server_rust_born, details.rust_born, firstTime);
        _evaluateServerParameter('server_rust_last_seed_change', serverParams.server_rust_last_seed_change,
            details.rust_last_seed_change, firstTime);
        _evaluateServerParameter('server_rust_last_wipe', serverParams.server_rust_last_wipe,
            details.rust_last_wipe, firstTime);
        _evaluateServerParameter('server_rust_last_wipe_ent', serverParams.server_rust_last_wipe_ent,
            details.rust_last_wipe_ent, firstTime);
        _evaluateServerParameter('server_serverSteamId', serverParams.server_serverSteamId,
            details.serverSteamId, firstTime);

        // Update local cache of server params (update 'this')
        // We'll iterate the keys we just checked and update them in serverParams
        update(data); // This updates serverParams and other fields

        /* Players evaluation */

        _newPlayers = [];
        _loginPlayers = [];
        _logoutPlayers = [];
        _nameChangedPlayers = [];
        const prevOnlinePlayers = _onlinePlayers;
        _onlinePlayers = [];
        _offlinePlayers = [];

        const included = data.included;
        for (const entity of included) {
            if (entity.type !== 'player') continue;

            const name = Utils.removeInvisibleCharacters(entity.attributes.name);
            const randomUsernames: string[] = (RandomUsernames as any).RandomUsernames;
            if (!randomUsernames.includes(name)) _streamerMode = false;

            if (!_players.hasOwnProperty(entity.id)) {  /* New Player */
                _players[entity.id] = {};

                /* From Battlemetrics */
                _players[entity.id]['id'] = entity.id;
                _players[entity.id]['name'] = name;
                _players[entity.id]['private'] = entity.attributes.private;
                _players[entity.id]['positiveMatch'] = entity.attributes.positiveMatch;
                _players[entity.id]['createdAt'] = entity.attributes.createdAt;
                _players[entity.id]['updatedAt'] = entity.attributes.updatedAt;
                const firstTimeVar = entity.meta.metadata.find((e: any) => e.key === 'firstTime');
                if (firstTimeVar) _players[entity.id]['firstTime'] = firstTimeVar.value;

                /* Other */
                _players[entity.id]['url'] = GET_BATTLEMETRICS_PLAYER_URL(entity.id);
                _players[entity.id]['status'] = true;
                _players[entity.id]['nameChangeHistory'] = [];
                _players[entity.id]['connectionLog'] = [];
                _players[entity.id]['logoutDate'] = null;

                if (!firstTime) _updateConnectionLog(entity.id, { type: 0, time: time }); /* 0 = Login event */

                _newPlayers.push(entity.id);
            }
            else {  /* Existing Player */
                /* From Battlemetrics */
                _players[entity.id]['id'] = entity.id;
                if (_players[entity.id]['name'] !== name) {
                    _nameChangedPlayers.push({
                        id: entity.id,
                        from: _players[entity.id]['name'],
                        to: name
                    });
                    _updateNameChangeHistory(entity.id, {
                        from: _players[entity.id]['name'],
                        to: name,
                        time: time
                    });
                    _players[entity.id]['name'] = name;
                }
                _players[entity.id]['private'] = entity.attributes.private;
                _players[entity.id]['positiveMatch'] = entity.attributes.positiveMatch;
                _players[entity.id]['createdAt'] = entity.attributes.createdAt;
                _players[entity.id]['updatedAt'] = entity.attributes.updatedAt;
                const firstTimeVal = entity.meta.metadata.find((e: any) => e.key === 'firstTime');
                if (firstTimeVal) _players[entity.id]['firstTime'] = firstTimeVal.value;

                /* Other */
                _players[entity.id]['url'] = GET_BATTLEMETRICS_PLAYER_URL(entity.id);
                if (_players[entity.id]['status'] === false) {
                    _players[entity.id]['status'] = true;
                    _updateConnectionLog(entity.id, { type: 0, time: time }); /* 0 = Login event */
                    _loginPlayers.push(entity.id);
                }
            }
            _onlinePlayers.push(entity.id);
        }

        const offlinePlayers = prevOnlinePlayers.filter(e => !_onlinePlayers.includes(e));
        for (const id of offlinePlayers) {
            _players[id]['status'] = false;
            _players[id]['logoutDate'] = time;
            _updateConnectionLog(id, { type: 1, time: time }); /* 1 = Logout event */
            _logoutPlayers.push(id);
        }

        for (const [playerId, content] of Object.entries(_players)) {
            if (content['status'] === false) _offlinePlayers.push(playerId);
        }

        return true;
    }

    function update(data: any) {
        _ready = true;
        _id = data.data.id;

        const attributes = data.data.attributes;
        serverParams.server_name = attributes.name;
        serverParams.server_address = attributes.address;
        serverParams.server_ip = attributes.ip;
        serverParams.server_port = attributes.port;
        serverParams.server_players = attributes.players;
        serverParams.server_maxPlayers = attributes.maxPlayers;
        serverParams.server_rank = attributes.rank;
        serverParams.server_location = attributes.location;
        serverParams.server_status = attributes.status;
        serverParams.server_private = attributes.private;
        serverParams.server_createdAt = attributes.createdAt;
        serverParams.server_updatedAt = attributes.updatedAt;
        serverParams.server_portQuery = attributes.portQuery;
        serverParams.server_country = attributes.country;
        serverParams.server_queryStatus = attributes.queryStatus;

        const details = attributes.details;
        serverParams.server_official = details.official;
        serverParams.server_rust_type = details.rust_type;
        serverParams.server_map = details.map;
        serverParams.server_environment = details.environment;
        serverParams.server_rust_build = details.rust_build;
        serverParams.server_rust_ent_cnt_i = details.rust_ent_cnt_i;
        serverParams.server_rust_fps = details.rust_fps;
        serverParams.server_rust_fps_avg = details.rust_fps_avg;
        serverParams.server_rust_gc_cl = details.rust_gc_cl;
        serverParams.server_rust_gc_mb = details.rust_gc_mb;
        serverParams.server_rust_hash = details.rust_hash;
        serverParams.server_rust_headerimage = details.rust_headerimage;
        serverParams.server_rust_mem_pv = details.rust_mem_pv;
        serverParams.server_rust_mem_ws = details.rust_mem_ws;
        serverParams.server_pve = details.pve;
        serverParams.server_rust_uptime = details.rust_uptime;
        serverParams.server_rust_url = details.rust_url;
        serverParams.server_rust_world_seed = details.rust_world_seed;
        serverParams.server_rust_world_size = details.rust_world_size;
        serverParams.server_rust_description = details.rust_description;
        serverParams.server_rust_modded = details.rust_modded;
        serverParams.server_rust_queued_players = details.rust_queued_players;
        serverParams.server_rust_gamemode = details.rust_gamemode;
        serverParams.server_rust_born = details.rust_born;
        serverParams.server_rust_last_seed_change = details.rust_last_seed_change;
        serverParams.server_rust_last_wipe = details.rust_last_wipe;
        serverParams.server_rust_last_wipe_ent = details.rust_last_wipe_ent;
        serverParams.server_serverSteamId = details.serverSteamId;

        const rustMaps = details.rust_maps;
        if (rustMaps) {
            _rustmapsAvailable = true;
            serverParams.map_url = rustMaps.url;
            serverParams.map_thumbnailUrl = rustMaps.thumbnailUrl;
            serverParams.map_monuments = rustMaps.monuments;
            serverParams.map_barren = rustMaps.barren;
            serverParams.map_updatedAt = rustMaps.updatedAt;
        }
        else {
            _rustmapsAvailable = false;
            serverParams.map_url = null;
            serverParams.map_thumbnailUrl = null;
            serverParams.map_monuments = null;
            serverParams.map_barren = null;
            serverParams.map_updatedAt = null;
        }
    }

    function getOnlineTime(playerId: string): [number, string] | null {
        if (!_lastUpdateSuccessful || !_players.hasOwnProperty(playerId) ||
            !_players[playerId]['updatedAt']) {
            return null;
        }

        return _formatTime(_players[playerId]['updatedAt']);
    }

    function getOfflineTime(playerId: string): [number, string] | null {
        if (!_lastUpdateSuccessful || !_players.hasOwnProperty(playerId) ||
            !_players[playerId]['logoutDate']) {
            return null;
        }

        return _formatTime(_players[playerId]['logoutDate']);
    }

    function getOnlinePlayerIdsOrderedByTime(): string[] {
        const unordered: [number, string][] = [];
        for (const playerId of _onlinePlayers) {
            const seconds = _formatTime(_players[playerId]['updatedAt']);
            unordered.push([seconds !== null ? seconds[0] : 0, playerId]);
        }
        let ordered = unordered.sort(function (a, b) { return b[0] - a[0] })
        return ordered.map(e => e[1]);
    }

    function getOfflinePlayerIdsOrderedByLeastTimeSinceOnline(): string[] {
        const unordered: [number, string][] = [];
        for (const playerId of _offlinePlayers) {
            const seconds = _formatTime(_players[playerId]['logoutDate']);
            unordered.push([seconds !== null ? seconds[0] : 0, playerId]);
        }
        let ordered = unordered.sort(function (a, b) { return a[0] - b[0] })
        return ordered.map(e => e[1]);
    }

    // Construct the object
    const client: BattlemetricsClient = {
        get id() { return _id; },
        set id(v) { _id = v; },
        get name() { return _name; },
        set name(v) { _name = v; },
        get data() { return _data; },
        set data(v) { _data = v; },
        get ready() { return _ready; },
        set ready(v) { _ready = v; },
        get updatedAt() { return _updatedAt; },
        set updatedAt(v) { _updatedAt = v; },
        get lastUpdateSuccessful() { return _lastUpdateSuccessful; },
        set lastUpdateSuccessful(v) { _lastUpdateSuccessful = v; },
        get rustmapsAvailable() { return _rustmapsAvailable; },
        set rustmapsAvailable(v) { _rustmapsAvailable = v; },
        get streamerMode() { return _streamerMode; },
        set streamerMode(v) { _streamerMode = v; },
        get serverLog() { return _serverLog; },
        set serverLog(v) { _serverLog = v; },
        get connectionLog() { return _connectionLog; },
        set connectionLog(v) { _connectionLog = v; },
        get players() { return _players; },
        set players(v) { _players = v; },
        get newPlayers() { return _newPlayers; },
        set newPlayers(v) { _newPlayers = v; },
        get loginPlayers() { return _loginPlayers; },
        set loginPlayers(v) { _loginPlayers = v; },
        get logoutPlayers() { return _logoutPlayers; },
        set logoutPlayers(v) { _logoutPlayers = v; },
        get nameChangedPlayers() { return _nameChangedPlayers; },
        set nameChangedPlayers(v) { _nameChangedPlayers = v; },
        get onlinePlayers() { return _onlinePlayers; },
        set onlinePlayers(v) { _onlinePlayers = v; },
        get offlinePlayers() { return _offlinePlayers; },
        set offlinePlayers(v) { _offlinePlayers = v; },
        get serverEvaluation() { return _serverEvaluation; },
        set serverEvaluation(v) { _serverEvaluation = v; },

        // Methods
        request,
        setup,
        updateStreamerMode,
        getServerIdFromName,
        getPlayerIdFromSteamId,
        getProfileData,
        evaluation,
        getOnlineTime,
        getOfflineTime,
        getOnlinePlayerIdsOrderedByTime,
        getOfflinePlayerIdsOrderedByLeastTimeSinceOnline,
        
        SEARCH_SERVER_NAME_API_CALL,
        GET_SERVER_DATA_API_CALL,
        GET_PROFILE_DATA_API_CALL,
        GET_SERVER_MOST_TIME_PLAYED_API_CALL,
        GET_BATTLEMETRICS_PLAYER_URL,
        
        // Expose serverParams via getters
        ...serverParams, // This only copies initial values. We need getters for dynamic access.
    };

    // To handle dynamic server params
    Object.keys(serverParams).forEach(key => {
        Object.defineProperty(client, key, {
            get: () => serverParams[key],
            set: (v) => serverParams[key] = v,
            enumerable: true,
            configurable: true
        });
    });

    return client;
}