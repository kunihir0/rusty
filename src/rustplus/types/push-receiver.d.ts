declare module '@liamcottle/push-receiver' {
    import { EventEmitter } from 'events';

    export interface GCMSubscription {
        token: string;
        androidId: string;
        securityToken: string;
        appId: string;
    }

    export interface FCMCredentials {
        keys: {
            privateKey: string;
            publicKey: string;
            authSecret: string;
        };
        fcm: {
            token: string;
        };
        gcm: GCMSubscription;
    }

    export interface NotificationPayload {
        notification: any;
        persistentId: string;
        object: any;
    }

    export class Client extends EventEmitter {
        constructor(androidId: string, securityToken: string, persistentIds: string[]);
        connect(): Promise<void>;
        destroy(): void;
    }

    export function register(senderId: string): Promise<FCMCredentials>;

    export function listen(
        androidId: string,
        securityToken: string,
        persistentIds: string[],
        notificationCallback: (payload: NotificationPayload) => void
    ): Promise<Client>;
    
    // Exporting AndroidFCM as any since its usage wasn't fully inspected but it is exported
    export const AndroidFCM: any;
}
