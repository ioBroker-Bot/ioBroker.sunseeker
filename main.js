"use strict";

/*
 * ioBroker.sunseeker
 *
 * Thin adapter wrapping the Sunseeker client library at lib/sunseeker/. The
 * library handles REST + MQTT against the Sunseeker cloud and emits events;
 * the adapter translates those events to ioBroker objects/states via json2iob.
 */

const utils = require("@iobroker/adapter-core");
const Json2iob = require("json2iob");
const Sunseeker = require("./lib/sunseeker");

const ERRORTYPE_LABELS = {
    0: "normal",
    2: "Trapped",
    16: "No border",
    32: "Started outside border",
    262144: "Charging power to high",
};

class SunseekerAdapter extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options]
     */
    constructor(options) {
        super({ ...options, name: "sunseeker" });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));

        this.json2iob = new Json2iob(this);
        /** @type {Sunseeker | null} */
        this.sunseeker = null;
        this.updateDeviceCommand = null;
        this.updateDeviceRain = null;
        this.updateDeviceBlade = null;
        this.updateDeviceSet = null;
        this.createObjectDone = {};
        this.firstStart = {};
        this.firstStartTimeout = null;
    }

    async onReady() {
        this.setState("info.connection", false, true);

        const cfg = this.config;
        if (!cfg.username || !cfg.password) {
            this.log.error("Please set the username and password in the adapter settings.");
            return;
        }

        const logger = {
            info: (/** @type {string} */ m) => this.log.info(m),
            warn: (/** @type {string} */ m) => this.log.warn(m),
            error: (/** @type {string} */ m) => this.log.error(m),
            debug: (/** @type {string} */ m) => this.log.debug(m),
        };

        const iobTimers = {
            setTimeout: (/** @type {any} */ c, /** @type {number} */ t) => this.setTimeout(c, t),
            clearTimeout: (/** @type {ioBroker.Timeout | undefined} */ x) => this.clearTimeout(x),
            setInterval: (/** @type {any} */ c, /** @type {number} */ t) => this.setInterval(c, t),
            clearInterval: (/** @type {ioBroker.Interval | undefined} */ x) => this.clearInterval(x),
        };

        const iobObjects = {
            extendObject: (/** @type {string} */ o, /** @type {any} */ d) => this.extendObject(o, d),
        };

        this.sunseeker = new Sunseeker(cfg.username, cfg.password, {
            region: cfg.region || "EU",
            apptype: cfg.apptype || "New",
            language: cfg.language || "de-DE",
            interval: Number(cfg.interval) > 0 ? Number(cfg.interval) : 300,
            refreshAfterMqttMs: 60000,
            logger,
            iobTimers,
            iobObjects,
        });

        this.sunseeker.on("devices", payload => this.onSunseekerDevices(payload));
        this.sunseeker.on("records", payload => this.onSunseekerRecords(payload));
        this.sunseeker.on("status", payload => this.onSunseekerStatus(payload));
        this.sunseeker.on("mqtt", payload => this.onSunseekerMqtt(payload));
        this.sunseeker.on("setMqtt", payload => this.onSunseekerSetMqtt(payload));
        this.sunseeker.on("map", payload => this.onSunseekerMap(payload));
        this.sunseeker.on("livemap", payload => this.onSunseekerLivemap(payload));
        this.sunseeker.on("firmware", payload => this.onSunseekerFirmware(payload));
        this.sunseeker.on("mqttConnect", () => this.setState("info.connection", true, true));
        this.sunseeker.on("mqttDisconnect", () => this.setState("info.connection", false, true));
        this.sunseeker.on("error", err => this.log.error(err.message || String(err)));

        this.subscribeStates("*");

        try {
            await this.sunseeker.start();
        } catch (err) {
            this.log.error(`Start failed: ${err.message}`);
            return;
        }
        this.setState("info.connection", true, true);

        try {
            await this.sunseeker.updateAllDevices();
        } catch (err) {
            this.log.warn(`Initial-Update: ${err.message}`);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback - Callback function
     */
    async onUnload(callback) {
        try {
            if (this.sunseeker) {
                this.sunseeker.stop();
                this.sunseeker = null;
            }
            this.updateDeviceCommand && this.clearTimeout(this.updateDeviceCommand);
            this.firstStartTimeout && this.clearTimeout(this.firstStartTimeout);
            this.updateDeviceRain && this.clearTimeout(this.updateDeviceRain);
            this.updateDeviceBlade && this.clearTimeout(this.updateDeviceBlade);
            this.updateDeviceSet && this.clearTimeout(this.updateDeviceSet);
            this.setState("info.connection", false, true);
            callback();
        } catch (error) {
            this.log.error(`Error during unloading: ${error.message}`);
            callback();
        }
    }

    /**
     * States for Device
     *
     * @param {string} sn
     */
    statesForDevice(sn) {
        if (!this.sunseeker) {
            return { errortype: { ...ERRORTYPE_LABELS } };
        }
        const meta = this.sunseeker.deviceMeta[sn];
        const events = this.sunseeker.getEventCodes(meta && meta.modelClass);
        const states = {
            0: `${meta && meta.modelClass == "X" && meta.modelClass == "S" ? "unknown" : "standby"}`,
            1: `${meta && meta.modelClass == "X" && meta.modelClass == "S" ? "idle" : "mowing"}`,
            2: `${meta && meta.modelClass == "X" && meta.modelClass == "S" ? "working" : "going home"}`,
            3: `${meta && meta.modelClass == "X" && meta.modelClass == "S" ? "pause" : "charging"}`,
            4: "unknown",
            5: "unknown",
            6: "error",
            7: `${meta && meta.modelClass == "X" && meta.modelClass == "S" ? "return" : "mowing border"}`,
            8: "pause",
            9: "charging",
            10: "charging full",
            11: "unknown",
            12: "unknown",
            13: "offline",
            14: "continue cutting",
            15: "location",
            16: "firmware update",
            17: "stuck",
            18: "stop",
            19: "unknown",
            20: "enter pin",
        };
        return {
            event_code: { ...events },
            errortype: { ...ERRORTYPE_LABELS },
            faultStatusCode: { ...ERRORTYPE_LABELS },
            status: states,
        };
    }

    async onSunseekerDevices({ devices }) {
        if (!Array.isArray(devices)) {
            return;
        }
        for (const d of devices) {
            const sn = d.deviceSn;
            await this.extendObject(sn, {
                type: "device",
                common: { name: d.deviceName || sn },
                native: {},
            });
            let path = "";
            if (this.sunseeker) {
                await this.sunseeker.createSettingsFW(sn);
                const meta = this.sunseeker.deviceMeta[sn];
                if (meta && (meta.modelClass === "S" || d.modelClass === "X")) {
                    path = `${sn}.map`;
                    if (!this.createObjectDone[path]) {
                        this.createObjectDone[path] = true;
                        await this.extendObject(path, {
                            type: "channel",
                            common: {
                                name: {
                                    en: "Maps",
                                    de: "Karten",
                                    ru: "Карты",
                                    pt: "Mapas",
                                    nl: "Kaarten",
                                    fr: "Cartes",
                                    it: "Mappe",
                                    es: "Mapas",
                                    pl: "Mapy",
                                    uk: "Карти",
                                    "zh-cn": "地图",
                                },
                            },
                            native: {},
                        });
                        await this.extendObject(`${sn}.map.livemap_update`, {
                            type: "state",
                            common: {
                                name: {
                                    en: "Update live map",
                                    de: "Live-Karte aktualisieren",
                                    ru: "Обновить карту в реальном времени",
                                    pt: "Atualizar mapa ao vivo",
                                    nl: "Live kaart bijwerken",
                                    fr: "Mise à jour de la carte en direct",
                                    it: "Aggiorna la mappa in tempo reale",
                                    es: "Actualizar mapa en directo",
                                    pl: "Aktualizuj mapę na żywo",
                                    uk: "Оновити карту в реальному часі",
                                    "zh-cn": "实时地图更新",
                                },
                                type: "boolean",
                                role: "switch",
                                read: true,
                                write: true,
                                def: false,
                            },
                            native: {},
                        });
                    }
                    const data = await this.getStateAsync(`${sn}.map.livemap_update`);
                    if (data && typeof data.val === "boolean") {
                        this.sunseeker.setLiveMap(sn, data.val);
                    }
                }
            }
            path = `${sn}.list`;
            if (!this.createObjectDone[path]) {
                this.createObjectDone[path] = true;
                await this.delObjectAsync(path, { recursive: true }).catch(() => {});
            }
            await this.json2iob.parse(`${sn}.general`, d, {
                channelName: {
                    en: "Generally",
                    de: "Allgemein",
                    ru: "В целом",
                    pt: "Geralmente",
                    nl: "Algemeen",
                    fr: "En général",
                    it: "Generalmente",
                    es: "Generalmente",
                    pl: "Ogólnie",
                    uk: "Зазвичай",
                    "zh-cn": "一般来说",
                },
                forceIndex: false,
                roles: {
                    picUrl: "text.url",
                    picUrlDetail: "text.url",
                },
            });
            if (!this.createObjectDone["ensureRemoteButtons"] && this.sunseeker) {
                this.createObjectDone["ensureRemoteButtons"] = true;
                await this.sunseeker.ensureRemoteButtons(sn);
                await this.sunseeker.ensureScheduleStates(sn);
            }
        }
    }

    async onSunseekerRecords({ sn, records }) {
        let path = `${sn}.events`;
        if (!this.createObjectDone[path]) {
            this.createObjectDone[path] = true;
            await this.extendObject(path, {
                type: "channel",
                common: {
                    name: {
                        en: "Event log",
                        de: "Ereignisprotokoll",
                        ru: "Журнал событий",
                        pt: "Registro de eventos",
                        nl: "Gebeurtenislogboek",
                        fr: "Journal des événements",
                        it: "Registro eventi",
                        es: "Registro de eventos",
                        pl: "Dziennik zdarzeń",
                        uk: "Журнал подій",
                        "zh-cn": "事件日志",
                    },
                },
                native: {},
            });
        }
        path = `${sn}.events.eventUpdate`;
        if (!this.createObjectDone[path]) {
            this.createObjectDone[path] = true;
            await this.extendObject(path, {
                type: "state",
                common: {
                    name: {
                        en: "Manuel update",
                        de: "Manuelle Aktualisierung",
                        ru: "Обновление руководства",
                        pt: "Atualização do Manuel",
                        nl: "Handmatige update",
                        fr: "Mise à jour du manuel",
                        it: "Aggiornamento manuale",
                        es: "Actualización de manual",
                        pl: "Aktualizacja instrukcji",
                        uk: "Оновлення Мануеля",
                        "zh-cn": "手动更新",
                    },
                    type: "boolean",
                    role: "button",
                    write: false,
                    read: true,
                    def: false,
                },
                native: {},
            });
        }
        path = `${sn}.events.events`;
        if (!this.createObjectDone[path]) {
            this.createObjectDone[path] = true;
            await this.extendObject(path, {
                type: "state",
                common: {
                    name: {
                        en: "Event log as JSON",
                        de: "Ereignisprotokoll als JSON",
                        ru: "Журнал событий в формате JSON",
                        pt: "Registro de eventos em formato JSON",
                        nl: "Gebeurtenislogboek als JSON",
                        fr: "Journal des événements au format JSON",
                        it: "Registro eventi in formato JSON",
                        es: "Registro de eventos como JSON",
                        pl: "Dziennik zdarzeń jako JSON",
                        uk: "Журнал подій у форматі JSON",
                        "zh-cn": "事件日志（JSON格式）",
                    },
                    type: "string",
                    role: "json",
                    write: false,
                    read: true,
                    def: JSON.stringify({}),
                },
                native: {},
            });
        }
        await this.setState(path, { val: JSON.stringify(records), ack: true });
        //ToDo Interval for update
    }

    async onSunseekerStatus({ sn, status, settings }) {
        const states = this.statesForDevice(sn);
        if (status) {
            await this.json2iob.parse(`${sn}.status`, status, {
                channelName: {
                    en: "Status",
                    de: "Status",
                    ru: "Статус",
                    pt: "Status",
                    nl: "Status",
                    fr: "Statut",
                    it: "Stato",
                    es: "Estado",
                    pl: "Status",
                    uk: "Статус",
                    "zh-cn": "地位",
                },
                forceIndex: false,
                roles: {
                    lat: "value.gps.latitude",
                    lng: "value.gps.longitude",
                    picUrl: "text.url",
                    url: "text.url",
                },
                states,
            });
        }
        if (settings) {
            const normalized = this.normalizeSettings(settings);
            await this.json2iob.parse(`${sn}.settings`, normalized, {
                channelName: {
                    en: "Settings",
                    de: "Einstellungen",
                    ru: "Настройки",
                    pt: "Configurações",
                    nl: "Instellingen",
                    fr: "Paramètres",
                    it: "Impostazioni",
                    es: "Ajustes",
                    pl: "Ustawienia",
                    uk: "Налаштування",
                    "zh-cn": "设置",
                },
                forceIndex: false,
                states,
            });
            const path = `${sn}.settings.pin_old`;
            if (!this.createObjectDone[path]) {
                this.createObjectDone[path] = true;
                await this.extendObject(path, {
                    type: "state",
                    common: {
                        name: {
                            en: "Old pin code",
                            de: "Alter PIN-Code",
                            ru: "Старый пин-код",
                            pt: "Código PIN antigo",
                            nl: "Oude pincode",
                            fr: "Ancien code postal",
                            it: "Vecchio codice PIN",
                            es: "Código PIN antiguo",
                            pl: "Stary kod PIN",
                            uk: "Старий поштовий індекс",
                            "zh-cn": "旧邮政编码",
                        },
                        type: "string",
                        role: "state",
                        write: true,
                        read: true,
                    },
                    native: {},
                });
                await this.extendObject(`${sn}.settings.pin_new`, {
                    type: "state",
                    common: {
                        name: {
                            en: "New pin code/Set the old PIN first",
                            de: "Neuer PIN-Code / Zuerst den alten PIN-Code festlegen",
                            ru: "Новый PIN-код/Сначала установите старый PIN-код",
                            pt: "Novo código PIN/Primeiro, defina o PIN antigo.",
                            nl: "Nieuwe pincode/Stel eerst de oude pincode in",
                            fr: "Nouveau code PIN / Définir l'ancien code PIN en premier",
                            it: "Nuovo codice PIN/Imposta prima il vecchio PIN",
                            es: "Nuevo código PIN/Establezca primero el PIN anterior",
                            pl: "Nowy kod PIN/Najpierw ustaw stary kod PIN",
                            uk: "Новий PIN-код/Спочатку встановіть старий PIN-код",
                            "zh-cn": "新密码/先设置旧密码",
                        },
                        type: "string",
                        role: "state",
                        write: true,
                        read: true,
                    },
                    native: {},
                });
            }
            await this.ensureWritableSettings(sn, normalized);
        }
    }

    /**
     * Coerce numeric/boolean settings fields to their canonical types so
     * json2iob and the typed states defined in ensureWritableSettings agree.
     *
     * @param {Record<string, any>} settings
     */
    normalizeSettings(settings) {
        const out = { ...settings };
        for (const key of ["bladeSpeed", "bladeHeight", "rainDelayDuration"]) {
            if (out[key] !== undefined && out[key] !== null && out[key] !== "") {
                const n = Number(out[key]);
                if (Number.isFinite(n)) {
                    out[key] = n;
                }
            }
        }
        if (out.rainFlag !== undefined && out.rainFlag !== null) {
            out.rainFlag =
                out.rainFlag === true || out.rainFlag === "true" || out.rainFlag === 1 || out.rainFlag === "1";
        }
        return out;
    }

    onSunseekerSetMqtt({ sn, data, id }) {
        if (!this.firstStart[sn]) {
            this.log.debug(`ID: ${id}`);
            if (id === "getDevAllProperty") {
                this.firstStart[sn] = true;
                this.addWriteable(sn, data);
            } else {
                this.setSettings(sn, data);
            }
        } else {
            this.setSettings(sn, data);
        }
    }

    onSunseekerMqtt({ sn, data }) {
        if (!data) {
            return;
        }
        if (data.time && typeof data.time === "object" && data.time !== null) {
            delete data.time;
            this.cleanUpCalendar(sn, data, 1);
        }
        if (data.time_custom && typeof data.time_custom === "object" && data.time_custom !== null) {
            delete data.time_custom;
            this.cleanUpCalendar(sn, data, 2);
        }
        this.json2iob.parse(`${sn}.status`, data, {
            channelName: {
                en: "Status",
                de: "Status",
                ru: "Статус",
                pt: "Status",
                nl: "Status",
                fr: "Statut",
                it: "Stato",
                es: "Estado",
                pl: "Status",
                uk: "Статус",
                "zh-cn": "地位",
            },
            forceIndex: false,
            roles: {
                lat: "value.gps.latitude",
                lng: "value.gps.longitude",
                picUrl: "text.url",
                url: "text.url",
            },
            states: this.statesForDevice(sn),
        });
    }

    async addWriteable(sn, data) {
        this.log.debug(`ID: ${sn}`);
        this.firstStartTimeout = this.setTimeout(async () => {
            this.firstStartTimeout = null;
            if (data && this.sunseeker) {
                await this.sunseeker.createSettings(sn, data);
            }
            await this.setSettings(sn, data);
        }, 5000);
    }

    async onSunseekerMap({ sn, kind, payload }) {
        if (kind === "info") {
            await this.json2iob.parse(`${sn}.map.info`, payload, {
                channelName: {
                    en: "Map",
                    de: "Karte",
                    ru: "Карта",
                    pt: "Mapa",
                    nl: "Kaart",
                    fr: "Carte",
                    it: "Mappa",
                    es: "Mapa",
                    pl: "Mapa",
                    uk: "Карта",
                    "zh-cn": "地图",
                },
                forceIndex: false,
                roles: {
                    mapPathFileUrl: "text.url",
                    realPathFileUlr: "text.url",
                },
            });
            return;
        }
        let path = "";
        if (kind === "backup") {
            path = `${sn}.map.backup`;
            if (!this.createObjectDone[path]) {
                this.createObjectDone[path] = true;
                await this.extendObject(path, {
                    type: "state",
                    common: {
                        name: {
                            en: "Backup Map (JSON)",
                            de: "Backup-Karte (JSON)",
                            ru: "Карта резервного копирования (JSON)",
                            pt: "Mapa de backup (JSON)",
                            nl: "Back-upkaart (JSON)",
                            fr: "Carte de sauvegarde (JSON)",
                            it: "Mappa di backup (JSON)",
                            es: "Mapa de respaldo (JSON)",
                            pl: "Mapa kopii zapasowej (JSON)",
                            uk: "Резервна карта (JSON)",
                            "zh-cn": "备份映射（JSON）",
                        },
                        type: "string",
                        role: "json",
                        read: true,
                        write: false,
                    },
                    native: {},
                });
            }
            this.setState(`${sn}.map.backup`, JSON.stringify(payload), true);
            return;
        }
        if (kind === "mapData" || kind === "pathData") {
            path = `${sn}.map.${kind}`;
            if (!this.createObjectDone[path]) {
                this.createObjectDone[path] = true;
                await this.extendObject(path, {
                    type: "state",
                    common: {
                        name: {
                            en: `Maps-${kind} (JSON)`,
                            de: `Karten-${kind} (JSON)`,
                            ru: `Maps-${kind} (JSON)`,
                            pt: `Mapas-${kind} (JSON)`,
                            nl: `Maps-${kind} (JSON)`,
                            fr: `Cartes-${kind} (JSON)`,
                            it: `Mappe-${kind} (JSON)`,
                            es: `Mapas-${kind} (JSON)`,
                            pl: `Mapy-${kind} (JSON)`,
                            uk: `Карти-${kind} (JSON)`,
                            "zh-cn": `地图-${kind} (JSON)`,
                        },
                        type: "string",
                        role: "json",
                        read: true,
                        write: false,
                    },
                    native: {},
                });
            }
            this.setState(`${sn}.map.${kind}`, payload, true);
            return;
        }
        // image / wifi / net / texture (data URLs)
        path = `${sn}.map.${kind}`;
        if (!this.createObjectDone[path]) {
            this.createObjectDone[path] = true;
            await this.extendObject(path, {
                type: "state",
                common: {
                    name: {
                        en: `Maps-${kind} (data URL)`,
                        de: `Maps-${kind} (Daten-URL)`,
                        ru: `Maps-${kind} (data URL)`,
                        pt: `Mapas-${kind} (URL de dados)`,
                        nl: `Maps-${kind} (data-URL)`,
                        fr: `Cartes-${kind} (URL des données)`,
                        it: `Mappe-${kind} (URL dei dati)`,
                        es: `Mapas-${kind} (URL de datos)`,
                        pl: `Mapy-${kind} (adres URL danych)`,
                        uk: `Карти-${kind} (URL-адреса даних)`,
                        "zh-cn": `地图-${kind}（数据 URL)`,
                    },
                    type: "string",
                    role: "state",
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
        this.setState(`${sn}.map.${kind}`, payload, true);
    }

    async onSunseekerFirmware(data) {
        this.log.debug(JSON.stringify(data));
        await this.setState(`${data.sn}.settings.firmware_update_available`, { val: data.update, ack: true });
        await this.setState(`${data.sn}.settings.firmware_description`, { val: data.desc, ack: true });
        await this.setState(`${data.sn}.settings.firmware_available`, { val: data.fw, ack: true });
    }

    async onSunseekerLivemap({ sn, dataUrl }) {
        const path = `${sn}.map.livemap`;
        if (!this.createObjectDone[path]) {
            this.createObjectDone[path] = true;
            await this.extendObject(path, {
                type: "state",
                common: {
                    name: {
                        en: "Live Map (rendered PNG data URL)",
                        de: "Live-Karte (URL der gerenderten PNG-Daten)",
                        ru: "Карта в реальном времени (URL-адрес визуализированных данных в формате PNG)",
                        pt: "Mapa ao vivo (URL com dados PNG renderizados)",
                        nl: "Live kaart (URL van weergegeven PNG-gegevens)",
                        fr: "Carte interactive (URL des données PNG rendues)",
                        it: "Mappa interattiva (URL dei dati PNG renderizzati)",
                        es: "Mapa interactivo (URL de datos PNG renderizados)",
                        pl: "Mapa na żywo (wyrenderowany adres URL danych PNG)",
                        uk: "Жива карта (URL-адреса даних PNG-візуалізації)",
                        "zh-cn": "实时地图（渲染后的PNG数据URL）",
                    },
                    type: "string",
                    role: "state",
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
        this.setState(`${sn}.map.livemap`, dataUrl, true);
    }

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (!state || state.ack || !this.sunseeker) {
            return;
        }
        const parts = id.split(".");
        const eventsIdx = parts.indexOf("events");
        if (parts[eventsIdx + 1] === "eventUpdate") {
            await this.sunseeker.getEvents(parts[eventsIdx - 1], 1, 10);
            this.setState(id, { val: false, ack: true });
            return;
        }
        const mapIdx = parts.indexOf("map");
        const snr = parts[mapIdx - 1];
        if (parts[mapIdx + 1] === "livemap_update" && state && typeof state.val === "boolean") {
            this.sunseeker.setLiveMap(snr, state.val);
            this.setState(id, { val: state.val, ack: true });
            return;
        }
        9;
        const scheduleIdx = parts.indexOf("schedule");
        if (scheduleIdx > 0 && parts[scheduleIdx + 1]) {
            const sn = parts[scheduleIdx - 1];
            const leaf = parts[scheduleIdx + 1];
            if (leaf === "loadSchedule") {
                this.sunseeker.fetchAllProperties(sn);
                this.setState(id, { val: false, ack: true });
                return;
            }
            if (leaf === "set") {
                this.collectSchedulePlan(sn);
                this.setState(id, { val: false, ack: true });
                return;
            }
            this.setState(id, { val: state.val, ack: true });
            return;
        }
        const settingsIdx = parts.indexOf("settings");
        if (settingsIdx > 0 && parts[settingsIdx + 1]) {
            const sn = parts[settingsIdx - 1];
            const leaf = parts[settingsIdx + 1];
            if (leaf === "pin_old") {
                if (typeof state.val === "string") {
                    const numberFormat = /^\d{4}$/;
                    if (numberFormat.test(state.val)) {
                        this.setState(id, { val: state.val, ack: true });
                    }
                }
                return;
            }
            if (leaf === "pin_new") {
                if (typeof state.val === "string") {
                    const numberFormat = /^\d{4}$/;
                    if (numberFormat.test(state.val)) {
                        const pin_old = await this.getStateAsync(`${sn}.settings.pin_old`);
                        if (pin_old && typeof pin_old.val === "string") {
                            if (numberFormat.test(pin_old.val)) {
                                this.sunseeker.changePin(sn, pin_old.val, state.val);
                                this.setState(id, { val: "", ack: true });
                                this.setState(`${sn}.settings.pin_old`, { val: "", ack: true });
                            }
                        }
                    }
                }
                return;
            }
            if (leaf === "firmware_update_start") {
                if (typeof state.val === "boolean") {
                    this.sunseeker.ota_upgrade(sn);
                    this.setState(id, { val: false, ack: true });
                }
                return;
            }
            if (leaf === "firmware_update_check_manuel") {
                if (typeof state.val === "boolean") {
                    // FW Check for all devices
                    this.sunseeker.startUpdateCheck(false);
                    this.setState(id, { val: false, ack: true });
                }
                return;
            }
            if (leaf === "night_work") {
                if (typeof state.val === "boolean") {
                    this.sunseeker.setSettings(sn, state.val, "setNightWork", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "energy_saving_mode") {
                if (typeof state.val === "boolean") {
                    this.sunseeker.setSettings(sn, state.val, "setEnergySavingMode", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "follow_border_freq") {
                if (typeof state.val === "number" && (state.val == 1 || state.val == 2 || state.val == 3)) {
                    this.sunseeker.setSettings(sn, state.val, "setFollowBorderFreq", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "recharge_mode") {
                if (typeof state.val === "number" && (state.val == 0 || state.val == 1 || state.val == 2)) {
                    this.sunseeker.setSettings(sn, state.val, "setRechargeMode", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "plan_mode") {
                if (typeof state.val === "number" && (state.val == 0 || state.val == 1 || state.val == 4)) {
                    this.sunseeker.setSettings(sn, state.val, "setPlanAngle", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "dev_name") {
                if (typeof state.val === "string" && state.val != "") {
                    this.sunseeker.setSettings(sn, state.val, "setDeviveName", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "dev_model") {
                if (typeof state.val === "string" && state.val != "") {
                    this.sunseeker.setSettings(sn, state.val, "setDevModel", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "workSpeed") {
                if (typeof state.val === "number" && (state.val == 1 || state.val == 2 || state.val == 3)) {
                    const gap = await this.getStateAsync(`${sn}.settings.gap`);
                    if (gap && gap.val != null && (gap.val == 1 || gap.val == 2 || gap.val == 3)) {
                        this.sunseeker.setMowEfficiency(sn, gap.val, state.val);
                        this.setState(id, { val: state.val, ack: true });
                    }
                }
                return;
            }
            if (leaf === "gap") {
                if (typeof state.val === "number" && (state.val == 1 || state.val == 2 || state.val == 3)) {
                    const speed = await this.getStateAsync(`${sn}.settings.workSpeed`);
                    if (speed && speed.val != null && (speed.val == 1 || speed.val == 2 || speed.val == 3)) {
                        this.sunseeker.setMowEfficiency(sn, state.val, speed.val);
                        this.setState(id, { val: state.val, ack: true });
                    }
                }
                return;
            }
            if (leaf === "work_touch_mode") {
                if (typeof state.val === "number" && (state.val == 0 || state.val == 1)) {
                    this.sunseeker.setSettings(sn, state.val, "setWorkTouchMode", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "auto_ride_edge_map_m") {
                if (typeof state.val === "number" && (state.val == 0 || state.val == 1)) {
                    this.sunseeker.setSettings(sn, state.val, "setAutoRideEdgeMapM", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "first_along_border") {
                if (typeof state.val === "boolean") {
                    this.sunseeker.setSettings(sn, state.val, "setFirstAlongBorder", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "time_work_repeat") {
                if (typeof state.val === "boolean") {
                    this.sunseeker.setSettings(sn, state.val, "setTimeWorkRepeat", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "dis_along_border") {
                if (typeof state.val === "number" && (state.val == 0 || state.val == 1)) {
                    this.sunseeker.setSettings(sn, state.val, "setDisAlongBorder", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "ai_sensitivity") {
                if (typeof state.val === "number" && (state.val == 0 || state.val == 1)) {
                    this.sunseeker.setSettings(sn, state.val, "setDisAlongBorder", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "bladeSpeed" || leaf === "bladeHeight") {
                const key = leaf === "bladeSpeed" ? "speed" : "height";
                try {
                    await this.sunseeker.setBlade(sn, key, Number(state.val));
                    this.updateDeviceBlade = this.setTimeout(
                        () => this.sunseeker?.updateDevice(sn).catch(() => {}),
                        1500,
                    );
                    this.setState(id, { val: state.val, ack: true });
                } catch (err) {
                    this.log.error(`Blade-${key} for ${sn} failed: ${err.message}`);
                }
                return;
            }
            if (leaf === "rainFlag" || leaf === "rainDelayDuration") {
                try {
                    const flagVal =
                        leaf === "rainFlag" ? state.val : (await this.getStateAsync(`${sn}.settings.rainFlag`))?.val;
                    const durVal =
                        leaf === "rainDelayDuration"
                            ? state.val
                            : (await this.getStateAsync(`${sn}.settings.rainDelayDuration`))?.val;
                    await this.sunseeker.setRain(sn, Boolean(flagVal), Math.round(Number(durVal) || 0));
                    this.updateDeviceRain = this.setTimeout(
                        () => this.sunseeker?.updateDevice(sn).catch(() => {}),
                        1500,
                    );
                    this.setState(id, { val: state.val, ack: true });
                } catch (err) {
                    this.log.error(`Rain delay for ${sn} failed: ${err.message}`);
                }
                return;
            }
        }
        const remoteIdx = parts.indexOf("remote");
        if (remoteIdx < 0 || remoteIdx + 1 >= parts.length) {
            return;
        }
        const sn = parts[remoteIdx - 1];
        const command = parts[remoteIdx + 1];
        if (!this.sunseeker.devicesRaw[sn]) {
            this.log.warn(`onStateChange: Device ${sn} unknown`);
            return;
        }
        try {
            if (command === "refresh") {
                await this.sunseeker.updateDevice(sn);
            } else if (command === "refresh_property") {
                await this.sunseeker.fetchInitialProperties();
            } else {
                await this.sunseeker.sendCommand(sn, command, state.val);
                this.updateDeviceCommand = this.setTimeout(
                    () => this.sunseeker?.updateDevice(sn).catch(() => {}),
                    1500,
                );
            }
            this.setState(id, { val: state.val, ack: true });
        } catch (err) {
            this.log.error(`Command ${command} for ${sn} failed: ${err.message}`);
        }
    }

    /**
     * @param {string} sn
     * @param {any} data
     * @param {number} plan
     */
    async cleanUpCalendar(sn, data, plan) {
        const dayPeriod = {
            1: "monday",
            2: "tuesday",
            3: "wednesday",
            4: "thursday",
            5: "friday",
            6: "saturday",
            0: "sunday",
        };
        const schedule = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 0: false };
        const schedule_empty = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 0: false };
        const schedule_empty2 = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 0: false };
        const mower_schedule = plan == 1 ? data.time : data.time_custom;
        for (const d of mower_schedule) {
            const day = d.period[0];
            const mower_day_name = dayPeriod[day];
            const mower_time = this.getTimeString(d.start, d.end);
            let path = `${sn}.schedule.${mower_day_name}`;
            this.log.info(day.toString());
            if (!schedule[day]) {
                schedule[day] = true;
                schedule_empty[day] = true;
            } else {
                path = `${sn}.schedule.${mower_day_name}_2`;
                schedule_empty2[day] = true;
            }
            await this.setState(path, { val: mower_time, ack: true });
        }
        if (typeof data.pause === "boolean") {
            await this.setState(`${sn}.schedule.pause}`, { val: data.pause, ack: true });
        }
        for (const d in schedule_empty) {
            if (!schedule_empty[d]) {
                await this.setState(`${sn}.schedule.${dayPeriod[d]}`, { val: "", ack: true });
            }
        }
        if (this.sunseeker) {
            const meta = this.sunseeker.deviceMeta[sn];
            if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
                for (const d in schedule_empty2) {
                    if (!schedule_empty2[d]) {
                        await this.setState(`${sn}.schedule.${dayPeriod[d]}_2`, { val: "", ack: true });
                    }
                }
            }
        }
    }

    /**
     * @param {number} start
     * @param {number} end
     * @returns {string} hh:mm-hh:mm
     */
    getTimeString(start, end) {
        const utcStart = new Date(start * 1000);
        const start_time = `${`0${utcStart.getUTCHours()}`.slice(-2)}:${`0${utcStart.getUTCMinutes()}`.slice(-2)}`;
        const utcEnd = new Date(end * 1000);
        const end_time = `${`0${utcEnd.getUTCHours()}`.slice(-2)}:${`0${utcEnd.getUTCMinutes()}`.slice(-2)}`;
        return `${start_time}-${end_time}`;
    }
    /**
     * @param {string} sn
     */
    async collectSchedulePlan(sn) {
        if (!this.sunseeker) {
            return;
        }
        const meta = this.sunseeker.deviceMeta[sn];
        const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        const plan = {};
        const plan2 = {};
        try {
            for (const day of days) {
                const st = await this.getStateAsync(`${sn}.schedule.${day}`);
                plan[day] = st && st.val && st.val != "" ? String(st.val) : "";
                if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
                    const st2 = await this.getStateAsync(`${sn}.schedule.${day}_2`);
                    plan2[day] = st2 && st2.val && st2.val != "" ? String(st2.val) : "";
                }
            }
            const pauseSt = await this.getStateAsync(`${sn}.schedule.pause`);
            plan.pause = !!(pauseSt && pauseSt.val);
            this.log.debug(`collectSchedulePlan 1: ${JSON.stringify(plan)}`);
            this.log.debug(`collectSchedulePlan 2: ${JSON.stringify(plan2)}`);
            await this.sunseeker.setSchedule(sn, plan, plan2);
            this.updateDeviceSet = this.setTimeout(() => this.sunseeker?.updateDevice(sn).catch(() => {}), 1500);
        } catch (err) {
            this.log.error(`Schedule for ${sn} failed: ${err.message}`);
        }
    }

    /**
     * @param {string} sn
     * @param {Record<string, any>} settingsData
     */
    async ensureWritableSettings(sn, settingsData) {
        if (!settingsData) {
            return;
        }
        let path = "";
        if (this.config.apptype !== "Old") {
            if (Object.prototype.hasOwnProperty.call(settingsData, "bladeSpeed")) {
                path = `${sn}.settings.bladeSpeed`;
                if (!this.createObjectDone[path]) {
                    this.createObjectDone[path] = true;
                    await this.extendObject(path, {
                        type: "state",
                        common: {
                            name: {
                                en: "Blade speed",
                                de: "Klingengeschwindigkeit",
                                ru: "Скорость лезвия",
                                pt: "Velocidade da lâmina",
                                nl: "Bladsnelheid",
                                fr: "vitesse de la lame",
                                it: "velocità della lama",
                                es: "Velocidad de la hoja",
                                pl: "Prędkość ostrza",
                                uk: "Швидкість леза",
                                "zh-cn": "刀刃速度",
                            },
                            type: "number",
                            role: "level",
                            min: 2800,
                            max: 3000,
                            step: 100,
                            unit: "rpm",
                            read: true,
                            write: true,
                        },
                        native: {},
                    });
                }
            }
            if (Object.prototype.hasOwnProperty.call(settingsData, "bladeHeight")) {
                path = `${sn}.settings.bladeHeight`;
                if (!this.createObjectDone[path]) {
                    this.createObjectDone[path] = true;
                    await this.extendObject(path, {
                        type: "state",
                        common: {
                            name: {
                                en: "Cutting height",
                                de: "Schnitthöhe",
                                ru: "Высота среза",
                                pt: "Altura de corte",
                                nl: "Snijhoogte",
                                fr: "Hauteur de coupe",
                                it: "altezza di taglio",
                                es: "Altura de corte",
                                pl: "Wysokość koszenia",
                                uk: "Висота зрізання",
                                "zh-cn": "切割高度",
                            },
                            type: "number",
                            role: "level",
                            min: 20,
                            max: 100,
                            step: 5,
                            unit: "mm",
                            read: true,
                            write: true,
                        },
                        native: {},
                    });
                }
            }
        }
        if (Object.prototype.hasOwnProperty.call(settingsData, "rainFlag")) {
            path = `${sn}.settings.rainFlag`;
            if (!this.createObjectDone[path]) {
                this.createObjectDone[path] = true;
                await this.extendObject(path, {
                    type: "state",
                    common: {
                        name: {
                            en: "Pause during rain",
                            de: "Pause bei Regen",
                            ru: "Пауза во время дождя",
                            pt: "Pausa durante a chuva",
                            nl: "Pauzeer tijdens regen",
                            fr: "Pause pendant la pluie",
                            it: "Pausa durante la pioggia",
                            es: "Pausa durante la lluvia",
                            pl: "Pauza podczas deszczu",
                            uk: "Пауза під час дощу",
                            "zh-cn": "雨中暂停",
                        },
                        type: "boolean",
                        role: "switch",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
            }
        }
        if (Object.prototype.hasOwnProperty.call(settingsData, "rainDelayDuration")) {
            path = `${sn}.settings.rainDelayDuration`;
            if (!this.createObjectDone[path]) {
                this.createObjectDone[path] = true;
                await this.extendObject(path, {
                    type: "state",
                    common: {
                        name: {
                            en: "Rain Delay Duration",
                            de: "Regenverzögerungsdauer",
                            ru: "Продолжительность задержки из-за дождя",
                            pt: "Duração do atraso devido à chuva",
                            nl: "Duur van de regenvertraging",
                            fr: "Durée du retard dû à la pluie",
                            it: "Durata del ritardo dovuto alla pioggia",
                            es: "Duración del retraso por lluvia",
                            pl: "Czas trwania opóźnienia z powodu deszczu",
                            uk: "Тривалість затримки через дощ",
                            "zh-cn": "雨天延误时长",
                        },
                        type: "number",
                        role: "level",
                        min: 0,
                        max: 720,
                        step: 1,
                        unit: "min",
                        read: true,
                        write: true,
                    },
                    native: {},
                });
            }
        }
    }

    async setSettings(sn, data) {
        if (data) {
            if (data.night_work != null) {
                await this.setState(`${sn}.settings.night_work`, { val: data.night_work, ack: true });
            }
            if (data.recharge_mode != null) {
                await this.setState(`${sn}.settings.recharge_mode`, { val: data.recharge_mode, ack: true });
            }
            if (data.work_touch_mode != null) {
                await this.setState(`${sn}.settings.work_touch_mode`, { val: data.work_touch_mode, ack: true });
            }
            if (data.auto_ride_edge_map_m != null) {
                await this.setState(`${sn}.settings.auto_ride_edge_map_m`, {
                    val: data.auto_ride_edge_map_m,
                    ack: true,
                });
            }
            if (data.dis_along_border != null) {
                await this.setState(`${sn}.settings.dis_along_border`, { val: data.dis_along_border, ack: true });
            }
            if (data.first_along_border != null) {
                await this.setState(`${sn}.settings.first_along_border`, { val: data.first_along_border, ack: true });
            }
            if (data.ai_sensitivity != null) {
                await this.setState(`${sn}.settings.ai_sensitivity`, { val: data.ai_sensitivity, ack: true });
            }
            if (data.time_work_repeat != null) {
                await this.setState(`${sn}.settings.time_work_repeat`, { val: data.time_work_repeat, ack: true });
            }
            if (data.follow_border_freq != null) {
                await this.setState(`${sn}.settings.follow_border_freq`, { val: data.follow_border_freq, ack: true });
            }
            if (data.plan_angle != null && data.plan_angle.plan_mode != null) {
                await this.setState(`${sn}.settings.plan_mode`, { val: data.plan_angle.plan_mode, ack: true });
            }
            if (data.mow_efficiency != null && data.mow_efficiency.speed != null) {
                await this.setState(`${sn}.settings.workSpeed`, { val: data.mow_efficiency.speed, ack: true });
            }
            if (data.mow_efficiency != null && data.mow_efficiency.gap != null) {
                await this.setState(`${sn}.settings.gap`, { val: data.mow_efficiency.gap, ack: true });
            }
            if (data.dev_name != null) {
                await this.setState(`${sn}.settings.dev_name`, { val: data.dev_name, ack: true });
            }
            if (data.dev_model != null) {
                await this.setState(`${sn}.settings.dev_model`, { val: data.dev_model, ack: true });
            }
            if (data.energy_saving_mode != null) {
                await this.setState(`${sn}.settings.energy_saving_mode`, { val: data.energy_saving_mode, ack: true });
            }
            if (data.rain != null) {
                if (data.rain.rain_flag != null) {
                    await this.setState(`${sn}.settings.rainFlag`, { val: data.rain.rain_flag, ack: true });
                }
                if (data.rain.delay != null) {
                    await this.setState(`${sn}.settings.rainDelayDuration`, { val: data.rain.delay, ack: true });
                }
            }
        }
    }
}

if (require.main !== module) {
    /**
     * @param {Partial<utils.AdapterOptions>} [options]
     */
    module.exports = options => new SunseekerAdapter(options);
} else {
    new SunseekerAdapter();
}
