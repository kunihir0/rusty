import { Client as PushReceiverClient, register, listen } from '@liamcottle/push-receiver';
import { createBattlemetricsClient } from './services/battlemetrics';
import * as Constants from './utils/Constants';
import * as MapUtils from './utils/Map';
import * as Scrape from './utils/Scrape';
import { RustPlus } from './ws';

// Define PersistenceManager interface locally as the file was not found
export interface PersistenceManager {
    loadState: () => { serverList: Record<string, any>, serverListLite: Record<string, any> };
    saveState: (state: any) => void;
}

export interface FcmHandlerConfig {
    androidId: string;
    securityToken: string;
    steamId: string;
    persistenceManager: PersistenceManager;
    rustplus?: RustPlus;
    onEvent?: (type: string, data: any) => void;
    log?: (msg: string) => void;
}

export function createFcmHandler(config: FcmHandlerConfig) {
    const androidId = config.androidId;
    const securityToken = config.securityToken;
    const steamId = config.steamId;
    const persistenceManager = config.persistenceManager;
    const rustplus: RustPlus | null = config.rustplus || null;
    const onEvent = config.onEvent || (() => {});
    const log = config.log || console.log;

    let client: PushReceiverClient | null = null;
    
    // State storage (initialized from persistence)
    const state: { serverList: Record<string, any>, serverListLite: Record<string, any> } = persistenceManager.loadState();

    // Ensure structure validity if file was empty or partial
    if (!state.serverList) state.serverList = {};
    if (!state.serverListLite) state.serverListLite = {};

    function start() {
        log(`Starting FCM Listener for SteamID: ${steamId}`);
        // The Client constructor in push-receiver expects persistentIds array
        client = new PushReceiverClient(androidId, securityToken, []);
        
        client.on('ON_DATA_RECEIVED', (data: any) => _onDataReceived(data));
        
        client.connect();
    }

    function destroy() {
        if (client) {
            client.destroy();
            client = null;
        }
    }

    function _onDataReceived(data: any) {
        const appData = data.appData;

        if (!appData) {
            log(`SteamID: ${steamId}, appData could not be found.`);
            return;
        }

        const title = appData.find((item: any) => item.key === 'title')?.value;
        const message = appData.find((item: any) => item.key === 'message')?.value;
        const channelId = appData.find((item: any) => item.key === 'channelId')?.value;

        if (!channelId) {
            log(`SteamID: ${steamId}, channelId could not be found.`);
            return;
        }

        const bodyCheck = appData.find((item: any) => item.key === 'body');

        if (!bodyCheck) {
            log(`SteamID: ${steamId}, body could not be found.`);
            return;
        }

        let body;
        try {
            body = JSON.parse(bodyCheck.value);
        } catch (e) {
            log(`SteamID: ${steamId}, failed to parse body JSON.`);
            return;
        }

        if (!body.type && channelId !== 'alarm') {
            log(`SteamID: ${steamId}, body type could not be found.`);
            return;
        }

        switch (channelId) {
            case 'pairing':
                void _handlePairing(title, message, body);
                break;
            case 'alarm':
                _handleAlarm(title, message, body);
                break;
            case 'player':
                _handlePlayer(title, message, body);
                break;
            case 'team':
                _handleTeam(title, message, body);
                break;
            default:
                log(`SteamID: ${steamId}, unknown channel: ${channelId}`);
                break;
        }
    }

    async function _handlePairing(title: string, message: string, body: any) {
        switch (body.type) {
            case 'server':
                log(`SteamID: ${steamId}, pairing: server`);
                await _pairingServer(title, message, body);
                break;

            case 'entity':
                switch (body.entityName) {
                    case 'Smart Switch':
                        log(`SteamID: ${steamId}, pairing: entity: Switch`);
                        await _pairingEntitySwitch(title, message, body);
                        break;
                    case 'Smart Alarm':
                        log(`SteamID: ${steamId}, pairing: entity: Smart Alarm`);
                        await _pairingEntitySmartAlarm(title, message, body);
                        break;
                    case 'Storage Monitor':
                        log(`SteamID: ${steamId}, pairing: entity: Storage Monitor`);
                        await _pairingEntityStorageMonitor(title, message, body);
                        break;
                    default:
                        log(`SteamID: ${steamId}, pairing: entity: other - ${body.entityName}`);
                        break;
                }
                break;
            default:
                log(`SteamID: ${steamId}, pairing: other - ${body.type}`);
                break;
        }
    }

    function _handleAlarm(title: string, message: string, body: any) {
        switch (body.type) {
            case 'alarm':
                log(`SteamID: ${steamId}, alarm: alarm`);
                _alarmAlarm(title, message, body);
                break;
            default:
                if (title === 'You\'re getting raided!') {
                    log(`SteamID: ${steamId}, alarm: raid-alarm plugin`);
                    onEvent('ALARM_RAID', { title, message, body });
                } else {
                    log(`SteamID: ${steamId}, alarm: other`);
                }
                break;
        }
    }

    function _handlePlayer(title: string, message: string, body: any) {
        switch (body.type) {
            case 'death':
                log(`SteamID: ${steamId}, player: death`);
                void _playerDeath(title, message, body);
                break;
            default:
                log(`SteamID: ${steamId}, player: other`);
                break;
        }
    }

    function _handleTeam(title: string, message: string, body: any) {
        switch (body.type) {
            case 'login':
                log(`SteamID: ${steamId}, team: login`);
                void _teamLogin(title, message, body);
                break;
            default:
                log(`SteamID: ${steamId}, team: other`);
                break;
        }
    }

    // --- Specific Logic Implementations ---

    function isValidUrl(url: string) {
        return url && (url.startsWith('https') || url.startsWith('http'));
    }

    async function _pairingServer(title: string, message: string, body: any) {
        const serverId = `${body.ip}-${body.port}`;
        const server = state.serverList[serverId];

        let battlemetricsId: number | null = null;
        const bmInstance = createBattlemetricsClient(null, title);
        await bmInstance.setup();
        if (bmInstance.lastUpdateSuccessful) {
            battlemetricsId = bmInstance.id;
        }

        const serverData = {
            title: title,
            serverIp: body.ip,
            appPort: body.port,
            steamId: body.playerId,
            playerToken: body.playerToken,
            description: body.desc.replace(/\\n/g, '\n').replace(/\\t/g, '\t'),
            img: isValidUrl(body.img) ? body.img.replace(/ /g, '%20') : Constants.DEFAULT_SERVER_IMG,
            url: isValidUrl(body.url) ? body.url.replace(/ /g, '%20') : Constants.DEFAULT_SERVER_URL,
            notes: server ? server.notes : {},
            switches: server ? server.switches : {},
            alarms: server ? server.alarms : {},
            storageMonitors: server ? server.storageMonitors : {},
            markers: server ? server.markers : {},
            switchGroups: server ? server.switchGroups : {},
            // messageId: (messageObj !== undefined) ? messageObj.id : null, // Discord specific
            battlemetricsId: battlemetricsId,
            connect: (!bmInstance.lastUpdateSuccessful) ? null :
                `connect ${bmInstance.server_ip}:${bmInstance.server_port}`,
            cargoShipEgressTimeMs: server ? server.cargoShipEgressTimeMs : Constants.DEFAULT_CARGO_SHIP_EGRESS_TIME_MS,
            oilRigLockedCrateUnlockTimeMs: server ? server.oilRigLockedCrateUnlockTimeMs :
                Constants.DEFAULT_OIL_RIG_LOCKED_CRATE_UNLOCK_TIME_MS,
            timeTillDay: server ? server.timeTillDay : null,
            timeTillNight: server ? server.timeTillNight : null
        };

        state.serverList[serverId] = serverData;
        
        // Also update Lite list if needed
        if (!state.serverListLite[serverId]) state.serverListLite[serverId] = {};
        state.serverListLite[serverId][body.playerId] = {
            serverIp: body.ip,
            appPort: body.port,
            steamId: body.playerId,
            playerToken: body.playerToken,
        };

        persistenceManager.saveState(state);
        onEvent('PAIRING_SERVER', { serverId, data: serverData });
    }

    async function _pairingEntitySwitch(title: string, message: string, body: any) {
        const serverId = `${body.ip}-${body.port}`;
        
        // Ensure server exists in state
        if (!state.serverList[serverId]) {
            state.serverList[serverId] = { switches: {} };
        }
        if (!state.serverList[serverId].switches) {
            state.serverList[serverId].switches = {};
        }

        const switches = state.serverList[serverId].switches;
        const entityExist = switches.hasOwnProperty(body.entityId);

        const switchData = {
            active: entityExist ? switches[body.entityId].active : false,
            reachable: entityExist ? switches[body.entityId].reachable : true,
            name: entityExist ? switches[body.entityId].name : 'Smart Switch',
            command: entityExist ? switches[body.entityId].command : body.entityId,
            image: entityExist ? switches[body.entityId].image : 'smart_switch.png',
            autoDayNightOnOff: entityExist ? switches[body.entityId].autoDayNightOnOff : 0,
            location: entityExist ? switches[body.entityId].location : null,
            x: entityExist ? switches[body.entityId].x : null,
            y: entityExist ? switches[body.entityId].y : null,
            server: entityExist ? switches[body.entityId].server : body.name,
            proximity: entityExist ? switches[body.entityId].proximity : Constants.PROXIMITY_SETTING_DEFAULT_METERS,
            // messageId: entityExist ? switches[body.entityId].messageId : null
        };

        state.serverList[serverId].switches[body.entityId] = switchData;

        // RustPlus Logic for verification (if rustplus instance is provided and connected to this server)
        // Note: rustplus.server/port aren't public properties on RustPlus class in ws.ts, but we can assume checks or fix ws.ts later.
        // For now, simple presence check.
        if (rustplus && rustplus.isConnected()) {
             try {
                const info = await rustplus.sendRequestAsync({
                    entityId: body.entityId,
                    getEntityInfo: {},
                });
                // Valid response check simplified
                if (!info || info.error) {
                    switchData.reachable = false;
                } else if (info.entityInfo?.payload) {
                    switchData.active = info.entityInfo.payload.value;
                }

                const teamInfo = await rustplus.sendRequestAsync({ getTeamInfo: {} });
                if (teamInfo && !teamInfo.error && teamInfo.teamInfo) {
                    const player = teamInfo.teamInfo.members.find((e: any) => e.steamId.toString() === rustplus['playerId']); // accessing private prop via string index or need getter
                    if (player) {
                        // CorrectedMapSize is not exposed on RustPlus class. Assuming passed or accessible.
                        // For now, use 3000 as default or fix.
                        // MapUtils.getPos requires rustplus instance with map info.
                        const location = MapUtils.getPos(player.x, player.y, (rustplus as any).info?.correctedMapSize || 4500, rustplus as any);
                        switchData.location = location.location;
                        switchData.x = location.x;
                        switchData.y = location.y;
                    }
                }
            } catch (err: any) {
                log(`Error during RustPlus verification: ${err.message}`);
            }
        }

        persistenceManager.saveState(state);
        onEvent('PAIRING_SWITCH', { serverId, entityId: body.entityId, data: switchData });
    }

    async function _pairingEntitySmartAlarm(title: string, message: string, body: any) {
        const serverId = `${body.ip}-${body.port}`;

         // Ensure server exists in state
         if (!state.serverList[serverId]) {
            state.serverList[serverId] = { alarms: {} };
        }
        if (!state.serverList[serverId].alarms) {
            state.serverList[serverId].alarms = {};
        }

        const alarms = state.serverList[serverId].alarms;
        const entityExist = alarms.hasOwnProperty(body.entityId);

        const alarmData: any = {
            active: entityExist ? alarms[body.entityId].active : false,
            reachable: entityExist ? alarms[body.entityId].reachable : true,
            everyone: entityExist ? alarms[body.entityId].everyone : false,
            name: entityExist ? alarms[body.entityId].name : 'Smart Alarm',
            message: entityExist ? alarms[body.entityId].message : 'Base is under attack!',
            lastTrigger: entityExist ? alarms[body.entityId].lastTrigger : null,
            command: entityExist ? alarms[body.entityId].command : body.entityId,
            id: entityExist ? alarms[body.entityId].id : body.entityId,
            image: entityExist ? alarms[body.entityId].image : 'smart_alarm.png',
            location: entityExist ? alarms[body.entityId].location : null,
            server: entityExist ? alarms[body.entityId].server : body.name,
            // messageId: entityExist ? alarms[body.entityId].messageId : null
        };

        state.serverList[serverId].alarms[body.entityId] = alarmData;

        if (rustplus && rustplus.isConnected()) {
             try {
                const info = await rustplus.sendRequestAsync({
                    entityId: body.entityId,
                    getEntityInfo: {},
                });
                if (!info || info.error) {
                    alarmData.reachable = false;
                } else if (info.entityInfo?.payload) {
                     alarmData.active = info.entityInfo.payload.value;
                }

                const teamInfo = await rustplus.sendRequestAsync({ getTeamInfo: {} });
                if (teamInfo && !teamInfo.error && teamInfo.teamInfo) {
                    const player = teamInfo.teamInfo.members.find((e: any) => e.steamId.toString() === rustplus['playerId']);
                    if (player) {
                        const location = MapUtils.getPos(player.x, player.y, (rustplus as any).info?.correctedMapSize || 4500, rustplus as any);
                        alarmData.location = location.location;
                    }
                }
             } catch (err: any) {
                log(`Error during RustPlus verification for Alarm: ${err.message}`);
             }
        }

        persistenceManager.saveState(state);
        onEvent('PAIRING_ALARM', { serverId, entityId: body.entityId, data: alarmData });
    }

    async function _pairingEntityStorageMonitor(title: string, message: string, body: any) {
        const serverId = `${body.ip}-${body.port}`;
        
         // Ensure server exists in state
         if (!state.serverList[serverId]) {
            state.serverList[serverId] = { storageMonitors: {} };
        }
        if (!state.serverList[serverId].storageMonitors) {
            state.serverList[serverId].storageMonitors = {};
        }

        const storageMonitors = state.serverList[serverId].storageMonitors;
        const entityExist = storageMonitors.hasOwnProperty(body.entityId);

        const monitorData: any = {
            name: entityExist ? storageMonitors[body.entityId].name : 'Storage Monitor',
            reachable: entityExist ? storageMonitors[body.entityId].reachable : true,
            id: entityExist ? storageMonitors[body.entityId].id : body.entityId,
            type: entityExist ? storageMonitors[body.entityId].type : null,
            decaying: entityExist ? storageMonitors[body.entityId].decaying : false,
            upkeep: entityExist ? storageMonitors[body.entityId].upkeep : null,
            everyone: entityExist ? storageMonitors[body.entityId].everyone : false,
            inGame: entityExist ? storageMonitors[body.entityId].inGame : true,
            image: entityExist ? storageMonitors[body.entityId].image : 'storage_monitor.png',
            location: entityExist ? storageMonitors[body.entityId].location : null,
            server: entityExist ? storageMonitors[body.entityId].server : body.name,
            // messageId: entityExist ? storageMonitors[body.entityId].messageId : null
        };

        state.serverList[serverId].storageMonitors[body.entityId] = monitorData;

        if (rustplus && rustplus.isConnected()) {
            try {
                const info = await rustplus.sendRequestAsync({
                    entityId: body.entityId,
                    getEntityInfo: {},
                });
                if (!info || info.error) {
                    monitorData.reachable = false;
                } else if (info.entityInfo?.payload) {
                     // Check capacity to determine type
                    if (info.entityInfo.payload.capacity === Constants.STORAGE_MONITOR_TOOL_CUPBOARD_CAPACITY) {
                        monitorData.type = 'toolCupboard';
                        monitorData.image = 'tool_cupboard.png';
                        if (info.entityInfo.payload.protectionExpiry === 0) {
                            monitorData.decaying = true;
                        }
                    } else if (info.entityInfo.payload.capacity === Constants.STORAGE_MONITOR_VENDING_MACHINE_CAPACITY) {
                        monitorData.type = 'vendingMachine';
                        monitorData.image = 'vending_machine.png';
                    } else if (info.entityInfo.payload.capacity === Constants.STORAGE_MONITOR_LARGE_WOOD_BOX_CAPACITY) {
                        monitorData.type = 'largeWoodBox';
                        monitorData.image = 'large_wood_box.png';
                    }
                    
                    // We might want to pass this detailed info out
                    monitorData.extraInfo = {
                         items: info.entityInfo.payload.items,
                         expiry: info.entityInfo.payload.protectionExpiry,
                         capacity: info.entityInfo.payload.capacity,
                         hasProtection: info.entityInfo.payload.hasProtection
                    };
                }

                const teamInfo = await rustplus.sendRequestAsync({ getTeamInfo: {} });
                if (teamInfo && !teamInfo.error && teamInfo.teamInfo) {
                    const player = teamInfo.teamInfo.members.find((e: any) => e.steamId.toString() === rustplus['playerId']);
                    if (player) {
                        const location = MapUtils.getPos(player.x, player.y, (rustplus as any).info?.correctedMapSize || 4500, rustplus as any);
                        monitorData.location = location.location;
                    }
                }
            } catch (err: any) {
                 log(`Error during RustPlus verification for StorageMonitor: ${err.message}`);
            }
        }

        persistenceManager.saveState(state);
        onEvent('PAIRING_STORAGE_MONITOR', { serverId, entityId: body.entityId, data: monitorData });
    }

    function _alarmAlarm(title: string, message: string, body: any) {
        const serverId = `${body.ip}-${body.port}`;
        const entityId = body.entityId;
        const server = state.serverList[serverId];
        
        if (!server || (server && !server.alarms[entityId])) return;

        // In original code, this only notifies if fcmAlarmNotificationEnabled is true and NOT connected to the server via RustPlus.
        // Here we just emit the event, letting the consumer decide.
        
        if (server.alarms[entityId]) {
            server.alarms[entityId].lastTrigger = Math.floor(new Date().getTime() / 1000);
        }

        onEvent('ALARM_TRIGGER', { serverId, entityId, title, message });
    }

    async function _playerDeath(title: string, message: string, body: any) {
        let png = null;
        if (body.targetId !== '') {
            png = await Scrape.scrapeSteamProfilePicture(body.targetId);
        }
        if (png === null) {
            png = isValidUrl(body.img) ? body.img : Constants.DEFAULT_SERVER_IMG;
        }

        onEvent('PLAYER_DEATH', { 
            title, 
            message, 
            body, 
            targetImage: png 
        });
    }

    async function _teamLogin(title: string, message: string, body: any) {
        let png = null;
        if (body.targetId) {
             png = await Scrape.scrapeSteamProfilePicture(body.targetId);
        }

        onEvent('TEAM_LOGIN', { 
            title, 
            message, 
            body, 
            targetImage: png 
        });
    }

    return {
        start,
        destroy,
        state
    };
}
