// Type declarations for the Sunseeker client class. The class body is composed
// at runtime via Object.assign(prototype, ...mixins) in main.js, which the JS
// type-checker can't see — these declarations mirror the real surface.

import { EventEmitter } from "node:events";

interface SunseekerOptions {
    region: string;
    apptype: string;
    language: string;
    interval: number;
    refreshAfterMqttMs: number;
}

declare class Sunseeker extends EventEmitter {
    constructor(username: string, password: string, iob: ioBroker.Adapter, options?: SunseekerOptions);

    username: string;
    password: string;
    iob: ioBroker.Adapter;
    options: SunseekerOptions;

    session: any;
    devicesRaw: Record<string, any>;
    deviceMeta: Record<string, any>;
    mqttClient: any;
    mqttOldClient: any;
    mqttPassword: string | undefined;
    appId: string | undefined;
    mqttsPasswordFlag: boolean;
    mqttWirefreeDomain: string | undefined;
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
    ensureAppId(): Promise<string>;
    getAppUserInfo(): Promise<any>;
    editMqttPassword(): Promise<void>;
    ownRequest(sn: string, data: any): Promise<void>;

    // devices.js
    loadEventCodes(language: string): void;
    classifyModel(modelName: string): "S" | "X" | "V" | "V1";
    mqttBroker(): { host: string; port: number };
    getDevices(): Promise<any[]>;
    getEvents(sn: string, current: number, size: number): Promise<void>;
    setScheduleInfo(sn: string, data: any): void;
    setScheduleMode(sn: string, mode: number): void;

    // polling-and-settings.js
    startPolling(): void;
    stopPolling(): void;
    updateAllDevices(): Promise<void>;
    updateDevice(sn: string): Promise<void>;
    sendCommand(sn: string, command: string, value?: any): Promise<void>;
    setBlade(sn: string, key: "speed" | "height", value: number): Promise<void>;
    setSettings(sn: string, value: string | number | boolean | null, id: string, key: string): Promise<void>;
    setRain(sn: string, flag: boolean, durationMin: number): Promise<void>;
    setSchedule(sn: string, plan: Record<string, any>, plan2: Record<string, any>): Promise<void>;
    parseScheduleDay(value: string): { startSec: number; endSec: number } | null;
    secToHms(sec: number): string;
    setMowEfficiency(sn: string, gap: number, speed: number): Promise<void>;
    changePin(sn: string, oldpin: string, newpin: string): Promise<void>;
    ota_upgrade(sn: string): Promise<void>;
    ota_base_upgrade(sn: string): Promise<void>;
    startUpdateCheck(first: boolean): Promise<void>;
    startUpdateCheckInterval(): Promise<void>;
    sleep(ms: number): Promise<void>;
    setPlanMode(sn: string, mode: number, angle: number): Promise<void>;
    setDeviceName(sn: string, val: ioBroker.State | null | undefined): Promise<void>;

    // mqtt.js
    initMqtt(): void;
    startMqttNew(): Promise<void>;
    connectMqtt(): void;
    scheduleMqttRetry(): void;
    startMqttOld(): void;
    onMqttMessage(topic: string, payload: Buffer): void;
    absorbLivemapState(meta: any, statusData: any): void;
    getDeviceProperty(sn: string, body: any): Promise<void>;
    setDeviceProperty(sn: string, body: any): Promise<void>;
    fetchInitialProperties(): Promise<void>;
    setLiveMap(sn: string, val: boolean): void;
    fetchAllProperties(sn: string): Promise<void>;

    // map.js
    fetchMap(sn: string): Promise<void>;
    fetchMapJson(sn: string, kind: string, url: string): Promise<any>;
    fetchMapImage(sn: string, kind: string, url: string): Promise<void>;
    renderLivemap(mapData: any, pathData: any, meta?: any): Promise<string | null>;
    fetchMapWithMqttData(sn: string): Promise<void>;

    // helper.js
    createSettings(sn: string, data: any): Promise<void>;
    createSettingsFW(sn: string): Promise<void>;
    ensureRemoteButtons(sn: string): Promise<void>;
    ensureScheduleStates(sn: string): Promise<void>;
    ensureOwnRequestStates(sn: string): Promise<void>;
    createDataPoint(
        ident: string,
        common: any,
        types: "state" | "folder" | "channel" | "device",
        value: string | number | boolean | null | undefined,
        extend: boolean | null | undefined,
        native: any,
    ): Promise<void>;
}

export = Sunseeker;
