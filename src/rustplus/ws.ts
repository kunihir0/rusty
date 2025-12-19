import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
// Import generated types from protobuf-es
import { AppRequestSchema, AppMessageSchema, type AppRequest, type AppMessage } from '../gen/rustplus_pb';

export class RustPlus extends EventEmitter {
    private server: string;
    private port: number;
    private playerId: string;
    private playerToken: number;
    private useFacepunchProxy: boolean;
    private seq: number;
    
    // Using a Map is more performant/safer than a sparse array for callbacks
    private seqCallbacks: Map<number, (msg: AppMessage) => boolean | void>;
    private websocket: WebSocket | null;

    /**
     * @param server The ip address or hostname of the Rust Server
     * @param port The port of the Rust Server (app.port in server.cfg)
     * @param playerId SteamId of the Player
     * @param playerToken Player Token from Server Pairing
     * @param useFacepunchProxy True to use secure websocket via Facepunch's proxy
     *
     * Events emitted by the RustPlus class instance
     * - connecting: When we are connecting to the Rust Server.
     * - connected: When we are connected to the Rust Server.
     * - message: When an AppMessage has been received from the Rust Server.
     * - request: When an AppRequest has been sent to the Rust Server.
     * - disconnected: When we are disconnected from the Rust Server.
     * - error: When something goes wrong.
     */
    constructor(server: string, port: number, playerId: string, playerToken: number, useFacepunchProxy: boolean = false) {
        super();

        this.server = server;
        this.port = port;
        this.playerId = playerId;
        this.playerToken = playerToken;
        this.useFacepunchProxy = useFacepunchProxy;

        this.seq = 0;
        this.seqCallbacks = new Map();
        this.websocket = null;
    }

    /**
     * This sets everything up and then connects to the Rust Server via WebSocket.
     */
    public connect(): void {
        // cleanup existing connection
        if (this.websocket) {
            this.disconnect();
        }

        this.emit('connecting');

        const address = this.useFacepunchProxy 
            ? `wss://companion-rust.facepunch.com/game/${this.server}/${this.port}` 
            : `ws://${this.server}:${this.port}`;

        this.websocket = new WebSocket(address);

        this.websocket.on('open', () => {
            this.emit('connected');
        });

        this.websocket.on('error', (e: Error) => {
            this.emit('error', e);
        });

        this.websocket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
            try {
                // Buffer handling for Bun/Node
                const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as any);
                
                // protobuf-es: decode from binary
                const message = fromBinary(AppMessageSchema, new Uint8Array(buffer));

                // Handle sequence callbacks
                if (message.response?.seq && this.seqCallbacks.has(message.response.seq)) {
                    const callback = this.seqCallbacks.get(message.response.seq);
                    
                    if (callback) {
                        const result = callback(message);
                        this.seqCallbacks.delete(message.response.seq);

                        // If callback returns true, stop propagation
                        if (result) return; 
                    }
                }

                this.emit('message', message);
            } catch (error) {
                this.emit('error', new Error(`Failed to decode message: ${error}`));
            }
        });

        this.websocket.on('close', () => {
            this.emit('disconnected');
        });
    }

    /**
     * Disconnect from the Rust Server.
     */
    public disconnect(): void {
        if (this.websocket) {
            this.websocket.terminate();
            this.websocket = null;
        }
    }

    /**
     * Check if RustPlus is connected to the server.
     */
    public isConnected(): boolean {
        return this.websocket !== null && this.websocket.readyState === WebSocket.OPEN;
    }

    /**
     * Send a Request to the Rust Server with an optional callback.
     * @param data Partial AppRequest data (excluding seq, playerId, playerToken)
     */
    public sendRequest(data: any, callback?: (msg: AppMessage) => boolean | void): void {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            this.emit('error', new Error('Not connected'));
            return;
        }

        const currentSeq = ++this.seq;

        if (callback) {
            this.seqCallbacks.set(currentSeq, callback);
        }

        // Create the request using protobuf-es constructor
        const request = create(AppRequestSchema, {
            seq: currentSeq,
            playerId: BigInt(this.playerId), // Rust+ usually expects uint64, handled as BigInt in ES
            playerToken: this.playerToken,
            ...data,
        });

        // Encode to binary and send
        this.websocket.send(toBinary(AppRequestSchema, request));

        this.emit('request', request);
    }

    /**
     * Send a Request to the Rust Server and return a Promise.
     * @param data Partial AppRequest data
     * @param timeoutMilliseconds Defaults to 10 seconds
     */
    public sendRequestAsync(data: any, timeoutMilliseconds: number = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout reached while waiting for response'));
            }, timeoutMilliseconds);

            this.sendRequest(data, (message) => {
                clearTimeout(timeout);

                if (message.response?.error) {
                    reject(message.response.error);
                } else {
                    resolve(message.response);
                }
            });
        });
    }

    /**
     * Set Entity Value.
     */
    public setEntityValue(entityId: number, value: boolean, callback?: (msg: AppMessage) => void): void {
        this.sendRequest({
            entityId: entityId,
            setEntityValue: {
                value: value,
            },
        }, callback);
    }

    /**
     * Turn a Smart Switch On
     */
    public turnSmartSwitchOn(entityId: number, callback?: (msg: AppMessage) => void): void {
        this.setEntityValue(entityId, true, callback);
    }

    /**
     * Turn a Smart Switch Off
     */
    public turnSmartSwitchOff(entityId: number, callback?: (msg: AppMessage) => void): void {
        this.setEntityValue(entityId, false, callback);
    }

    /**
     * Quickly turn on and off a Smart Switch as if it were a Strobe Light.
     */
    public strobe(entityId: number, timeoutMilliseconds: number = 100, value: boolean = true): void {
        this.setEntityValue(entityId, value);
        setTimeout(() => {
            this.strobe(entityId, timeoutMilliseconds, !value);
        }, timeoutMilliseconds);
    }

    /**
     * Send a message to Team Chat
     */
    public sendTeamMessage(message: string, callback?: (msg: AppMessage) => void): void {
        this.sendRequest({
            sendTeamMessage: {
                message: message,
            },
        }, callback);
    }

    /**
     * Get info for an Entity
     */
    public getEntityInfo(entityId: number, callback?: (msg: AppMessage) => void): void {
        this.sendRequest({
            entityId: entityId,
            getEntityInfo: {},
        }, callback);
    }

    /**
     * Get the Map
     */
    public getMap(callback?: (msg: AppMessage) => void): void {
        this.sendRequest({ getMap: {} }, callback);
    }

    /**
     * Get the ingame time
     */
    public getTime(callback?: (msg: AppMessage) => void): void {
        this.sendRequest({ getTime: {} }, callback);
    }

    /**
     * Get all map markers
     */
    public getMapMarkers(callback?: (msg: AppMessage) => void): void {
        this.sendRequest({ getMapMarkers: {} }, callback);
    }

    /**
     * Get the server info
     */
    public getInfo(callback?: (msg: AppMessage) => void): void {
        this.sendRequest({ getInfo: {} }, callback);
    }

    /**
     * Get team info
     */
    public getTeamInfo(callback?: (msg: AppMessage) => void): void {
        this.sendRequest({ getTeamInfo: {} }, callback);
    }
}