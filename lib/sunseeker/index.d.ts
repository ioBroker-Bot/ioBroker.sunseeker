// Type declarations for the Sunseeker client class. The class body is composed
// at runtime via Object.assign(prototype, ...mixins) in main.js, which the JS
// type-checker can't see — these declarations mirror the real surface.

import { EventEmitter } from "node:events";

interface Logger {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
    debug: (m: string) => void;
}

interface IobTimers {
    setTimeout: (c: any, t: number) => void;
    clearTimeout: (x: ioBroker.Timeout) => void;
    setInterval: (c: any, t: number) => void;
    clearInterval: (x: ioBroker.Interval) => void;
}

interface IobObjects {
    extendObject: (o: string, d: any) => void;
}

interface SunseekerOptions {
    region: string;
    apptype: string;
    language: string;
    interval: number;
    refreshAfterMqttMs: number;
    logger: Logger;
    iobTimers: IobTimers;
    iobObjects: IobObjects;
}

declare class Sunseeker extends EventEmitter {
    constructor(username: string, password: string, options?: SunseekerOptions);

    username: string;
    password: string;
    options: SunseekerOptions;
    log: Logger;
    iobTimer: IobTimers;
    iobObject: IobObjects;

    session: any;
    devicesRaw: Record<string, any>;
    deviceMeta: Record<string, any>;
    mqttClient: any;
    mqttOldClient: any;
    mqttPassword: string | undefined;
    eventCodes: Record<string, string>;
    v1EventCodes: Record<string, string>;
    unloading: boolean;

    start(): Promise<void>;
    stop(): void;
    getEventCodes(modelClass: string): Record<string, string>;

    // auth.js
    getBase(): { url: string; host: string };
    authHeaders(): Record<string, string>;
    request(
        method: string,
        urlPath: string,
        headers: Record<string, string>,
        data?: any,
    ): Promise<{ status: number; json: any }>;
    login(): Promise<void>;
    refreshToken(): Promise<void>;
    encryptRsa(plaintext: string): string;
    randomMqttPassword(): string;
    editMqttPassword(): Promise<void>;

    // devices.js
    loadEventCodes(language: string): void;
    classifyModel(modelName: string): "S" | "X" | "V" | "V1";
    mqttBroker(): { host: string; port: number };
    getDevices(): Promise<any[]>;
    getEvents(sn: string, current: number, size: number): Promise<void>;

    // polling-and-settings.js
    startPolling(): void;
    stopPolling(): void;
    updateAllDevices(): Promise<void>;
    updateDevice(sn: string): Promise<void>;
    sendCommand(sn: string, command: string, value?: any): Promise<void>;
    setBlade(sn: string, key: "speed" | "height", value: number): Promise<void>;
    setSettings(sn: string, value: string | number | boolean | null, id: string, key: string): Promise<void>;
    setRain(sn: string, flag: boolean, durationMin: number): Promise<void>;
    setSchedule(sn: string, plan: Record<string, any>): Promise<void>;
    parseScheduleDay(value: string): { startSec: number; endSec: number } | null;
    secToHms(sec: number): string;
    setMowEfficiency(sn: string, gap: number, speed: number): Promise<void>;
    changePin(sn: string, oldpin: string, newpin: string): Promise<void>;
    ota_upgrade(sn: string): Promise<void>;
    ota_base_upgrade(sn: string): Promise<void>;
    startUpdateCheck(first: boolean): Promise<void>;
    startUpdateCheckInterval(): Promise<void>;
    sleep(ms: number): Promise<void>;

    // mqtt.js
    initMqtt(): void;
    startMqttNew(): Promise<void>;
    connectMqtt(): void;
    scheduleMqttRetry(): void;
    startMqttOld(): void;
    onMqttMessage(topic: string, payload: Buffer): void;
    absorbLivemapState(meta: any, statusData: any): void;
    getDeviceProperty(sn: string, body: any): Promise<void>;
    fetchInitialProperties(): Promise<void>;

    // map.js
    fetchMap(sn: string): Promise<void>;
    fetchMapJson(sn: string, kind: string, url: string): Promise<any>;
    fetchMapImage(sn: string, kind: string, url: string): Promise<void>;
    renderLivemap(mapData: any, pathData: any, meta?: any): Promise<string | null>;

    // helper.js
    createSettings(sn: string, data: any): Promise<void>;
    createSettingsFW(sn: string): Promise<void>;
}

export = Sunseeker;
