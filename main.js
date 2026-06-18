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
        this.on("message", this.onMessage.bind(this));

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
        this.restartLimit = {
            restartCount: 0,
            restartLast: 0,
            restartTime: "",
            day: "01-01",
        };
    }

    async onReady() {
        this.setState("info.connection", false, true);

        const reqCount = await this.getStateAsync(`rateLimit.restart`);
        if (reqCount && reqCount.val != null && typeof reqCount.val === "string" && reqCount.val.startsWith("{")) {
            const infoCount = JSON.parse(reqCount.val);
            if (Object.keys(infoCount).length === 4) {
                this.log.debug(`Use old restartLimit data!`);
                this.restartLimit = infoCount;
            }
        }
        const diffTime = new Date().getTime() - this.restartLimit.restartLast;
        if (diffTime > 24 * 60 * 1000 * 60 || this.restartLimit.day != this.getWeek()) {
            this.restartLimit.restartCount = 0;
            this.restartLimit.restartLast = new Date().getTime();
            this.restartLimit.restartTime = new Date().toISOString();
            this.restartLimit.day = this.getWeek();
        }
        if (this.restartLimit.restartCount > 10) {
            this.log.warn(`The restart limit of 10 per day has been reached.`);
            return;
        }
        ++this.restartLimit.restartCount;
        await this.setRestartCount();

        const cfg = this.config;
        if (!cfg.username || !cfg.password) {
            this.log.error("Please set the username and password in the adapter settings.");
            return;
        }

        this.sunseeker = new Sunseeker(cfg.username, cfg.password, this, {
            region: cfg.region || "EU",
            apptype: cfg.apptype || "New",
            language: cfg.language || "de-DE",
            interval: Number(cfg.interval) > 0 ? Number(cfg.interval) : 300,
            refreshAfterMqttMs: 60000,
        });

        await this.createAuth();

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
        this.sunseeker.on("error", err => this.log.error(`mqtt error: ${err.message || String(err)}`));
        this.sunseeker.on("own", payload => this.onSunseekerOwn(payload));
        this.sunseeker.on("mqtt_auth", payload => this.onSunseekerMqttAuth(payload));
        this.sunseeker.on("session", payload => this.onSunseekerSession(payload));
        this.sunseeker.on("mode", payload => this.onSunseekerScheduleMode(payload));

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
     * @param {ioBroker.Message} obj
     */
    async onMessage(obj) {
        if (typeof obj === "object" && obj.message) {
            switch (obj.command) {
                case "createOwnRequest":
                    if (obj.message && obj.message.sn && obj.message.sn != "" && this.sunseeker) {
                        if (!this.sunseeker.devicesRaw[obj.message.sn]) {
                            this.log.warn(`createOwnRequest: Device ${obj.message.sn} unknown`);
                            if (obj.callback) {
                                this.sendTo(
                                    obj.from,
                                    obj.command,
                                    [{ info: `Device ${obj.message.sn} unknown` }],
                                    obj.callback,
                                );
                            }
                            return;
                        }
                        this.sunseeker.ensureOwnRequestStates(obj.message.sn);
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, [{ info: "OK" }], obj.callback);
                        }
                    } else {
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, [{ info: "Error" }], obj.callback);
                        }
                    }
                    break;
                case "sendOwnRequest":
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, [{ info: "In progress" }], obj.callback);
                    }
                    break;
                default:
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, [{ info: "Error" }], obj.callback);
                    }
            }
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
        let common;
        for (const d of devices) {
            const sn = d.deviceSn;
            let path = "";
            if (this.sunseeker) {
                common = {
                    name: d.deviceName || sn,
                    icon: "img/schedule.png",
                };
                await this.sunseeker.createDataPoint(`${this.namespace}.${sn}`, common, "device", null, null, null);
                await this.sunseeker.createSettingsFW(sn);
                const meta = this.sunseeker.deviceMeta[sn];
                if (meta && (meta.modelClass === "S" || d.modelClass === "X")) {
                    path = `${sn}.map`;
                    if (!this.createObjectDone[path]) {
                        this.createObjectDone[path] = true;
                        common = {
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
                            icon: "img/map.png",
                        };
                        await this.sunseeker.createDataPoint(
                            `${this.namespace}.${path}`,
                            common,
                            "channel",
                            null,
                            null,
                            null,
                        );
                        common = {
                            name: {
                                en: "Zonen",
                                de: "Zonen",
                                ru: "Зонен",
                                pt: "Zona",
                                nl: "Zones",
                                fr: "Zonen",
                                it: "Zonan",
                                es: "Zona",
                                pl: "Strefy",
                                uk: "Зонен",
                                "zh-cn": "区域",
                            },
                            icon: "img/map.png",
                        };
                        await this.sunseeker.createDataPoint(
                            `${this.namespace}.${path}.zonen`,
                            common,
                            "channel",
                            null,
                            null,
                            null,
                        );
                        common = {
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
                        };
                        await this.sunseeker.createDataPoint(
                            `${this.namespace}.${sn}.map.livemap_update`,
                            common,
                            "state",
                            null,
                            null,
                            null,
                        );
                    }
                    const data = await this.getStateAsync(`${sn}.map.livemap_update`);
                    if (data && typeof data.val === "boolean") {
                        this.sunseeker.setLiveMap(sn, data.val);
                    }
                }
            }
            path = `${sn}.mower_raw`;
            const cleanup = this.removeNull(d);
            await this.json2iob.parse(`${sn}.mower_raw`, cleanup, {
                channelName: {
                    en: "All data from cloud and mqtt",
                    de: "Alle Daten aus der Cloud und MQTT",
                    ru: "Все данные поступают из облака и MQTT.",
                    pt: "Todos os dados da nuvem e do MQTT",
                    nl: "Alle gegevens zijn afkomstig uit de cloud en via MQTT.",
                    fr: "Toutes les données proviennent du cloud et de MQTT.",
                    it: "Tutti i dati dal cloud e MQTT",
                    es: "Todos los datos provienen de la nube y MQTT.",
                    pl: "Wszystkie dane z chmury i MQTT",
                    uk: "Всі дані з хмари та mqtt",
                    "zh-cn": "所有数据均来自云端和 MQTT",
                },
                forceIndex: true,
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
            if (!this.createObjectDone[path] && this.sunseeker) {
                this.createObjectDone[path] = true;
                common = {
                    name: {
                        en: "All data from cloud and mqtt",
                        de: "Alle Daten aus der Cloud und MQTT",
                        ru: "Все данные поступают из облака и MQTT.",
                        pt: "Todos os dados da nuvem e do MQTT",
                        nl: "Alle gegevens zijn afkomstig uit de cloud en via MQTT.",
                        fr: "Toutes les données proviennent du cloud et de MQTT.",
                        it: "Tutti i dati dal cloud e MQTT",
                        es: "Todos los datos provienen de la nube y MQTT.",
                        pl: "Wszystkie dane z chmury i MQTT",
                        uk: "Всі дані з хмари та mqtt",
                        "zh-cn": "所有数据均来自云端和 MQTT",
                    },
                    icon: "img/raw.png",
                };
                await this.sunseeker.createDataPoint(
                    `${this.namespace}.${sn}.mower_raw`,
                    common,
                    "channel",
                    null,
                    null,
                    null,
                );
            }
        }
    }

    async onSunseekerRecords({ sn, records }) {
        let common;
        let path = `${sn}.events`;
        if (!this.createObjectDone[path] && this.sunseeker) {
            this.createObjectDone[path] = true;
            common = {
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
                icon: "img/work.png",
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "channel", null, null, null);
        }
        path = `${sn}.events.eventUpdate`;
        if (!this.createObjectDone[path] && this.sunseeker) {
            this.createObjectDone[path] = true;
            common = {
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
                write: true,
                read: false,
                def: false,
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
        }
        path = `${sn}.events.events`;
        if (!this.createObjectDone[path] && this.sunseeker) {
            this.createObjectDone[path] = true;
            common = {
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
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
        }
        await this.setState(path, { val: JSON.stringify(records), ack: true });
        //ToDo Interval for update
    }

    async onSunseekerStatus({ sn, status, settings }) {
        const states = this.statesForDevice(sn);
        if (status) {
            const cleanup = this.removeNull(status);
            await this.setSettings(sn, cleanup);
            await this.json2iob.parse(`${sn}.mower_raw`, cleanup, {
                channelName: {
                    en: "All data from cloud and mqtt",
                    de: "Alle Daten aus der Cloud und MQTT",
                    ru: "Все данные поступают из облака и MQTT.",
                    pt: "Todos os dados da nuvem e do MQTT",
                    nl: "Alle gegevens zijn afkomstig uit de cloud en via MQTT.",
                    fr: "Toutes les données proviennent du cloud et de MQTT.",
                    it: "Tutti i dati dal cloud e MQTT",
                    es: "Todos los datos provienen de la nube y MQTT.",
                    pl: "Wszystkie dane z chmury i MQTT",
                    uk: "Всі дані з хмари та mqtt",
                    "zh-cn": "所有数据均来自云端和 MQTT",
                },
                forceIndex: true,
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
            const cleanup = this.removeNull(normalized);
            await this.json2iob.parse(`${sn}.mower_raw`, cleanup, {
                channelName: {
                    en: "All data from cloud and mqtt",
                    de: "Alle Daten aus der Cloud und MQTT",
                    ru: "Все данные поступают из облака и MQTT.",
                    pt: "Todos os dados da nuvem e do MQTT",
                    nl: "Alle gegevens zijn afkomstig uit de cloud en via MQTT.",
                    fr: "Toutes les données proviennent du cloud et de MQTT.",
                    it: "Tutti i dati dal cloud e MQTT",
                    es: "Todos los datos provienen de la nube y MQTT.",
                    pl: "Wszystkie dane z chmury i MQTT",
                    uk: "Всі дані з хмари та mqtt",
                    "zh-cn": "所有数据均来自云端和 MQTT",
                },
                forceIndex: true,
                states,
            });
            const path = `${sn}.settings.pin_old`;
            let common;
            if (!this.createObjectDone[path] && this.sunseeker) {
                this.createObjectDone[path] = true;
                common = {
                    name: {
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
                    icon: "img/properties.png",
                };
                await this.sunseeker.createDataPoint(
                    `${this.namespace}.${sn}.settings`,
                    common,
                    "channel",
                    null,
                    null,
                    null,
                );
                common = {
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
                };
                await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
                common = {
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
                };
                await this.sunseeker.createDataPoint(
                    `${this.namespace}.${sn}.settings.pin_new`,
                    common,
                    "state",
                    null,
                    null,
                    null,
                );
            }
            await this.ensureWritableSettings(sn, normalized);
            await this.setSettings(sn, cleanup);
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
        if (id === "getDevAllProperty") {
            if (this.sunseeker) {
                this.sunseeker.setScheduleInfo(sn, data);
            }
        }
    }

    onSunseekerMqtt({ sn, data }) {
        if (!data) {
            return;
        }
        if (data.time && typeof data.time === "object" && data.time !== null) {
            const time_schedule = Object.assign({}, data);
            this.cleanUpCalendar(sn, time_schedule, 1);
            delete data.time;
        }
        if (data.time_custom && typeof data.time_custom === "object" && data.time_custom !== null) {
            if (data.time_custom.time && typeof data.time_custom.time === "object" && data.time_custom.time !== null) {
                const time_schedule2 = Object.assign({}, data);
                this.cleanUpCalendar(sn, time_schedule2.time_custom, 1);
                delete data.time;
            } else {
                const time_schedule_custom = Object.assign({}, data);
                this.cleanUpCalendar(sn, time_schedule_custom, 2);
                delete data.time_custom;
            }
        }
        const cleanup = this.removeNull(data);
        this.json2iob.parse(`${sn}.mower_raw`, cleanup, {
            channelName: {
                en: "All data from cloud and mqtt",
                de: "Alle Daten aus der Cloud und MQTT",
                ru: "Все данные поступают из облака и MQTT.",
                pt: "Todos os dados da nuvem e do MQTT",
                nl: "Alle gegevens zijn afkomstig uit de cloud en via MQTT.",
                fr: "Toutes les données proviennent du cloud et de MQTT.",
                it: "Tutti i dati dal cloud e MQTT",
                es: "Todos los datos provienen de la nube y MQTT.",
                pl: "Wszystkie dane z chmury i MQTT",
                uk: "Всі дані з хмари та mqtt",
                "zh-cn": "所有数据均来自云端和 MQTT",
            },
            forceIndex: true,
            roles: {
                lat: "value.gps.latitude",
                lng: "value.gps.longitude",
                picUrl: "text.url",
                url: "text.url",
            },
            states: this.statesForDevice(sn),
        });
        const path = `${sn}.settings.plan_angle`;
        if (!this.createObjectDone[path]) {
            this.createObjectDone[path] = true;
            if (cleanup.plan_angle && cleanup.plan_angle.multi_zigzag_angles != null && this.sunseeker) {
                const states = [];
                states.push(0);
                if (Object.keys(cleanup.plan_angle.multi_zigzag_angles).length > 0) {
                    for (const angle of cleanup.plan_angle.multi_zigzag_angles) {
                        if (angle.active) {
                            states.push(angle.angle);
                        }
                    }
                    const common = {
                        name: {
                            en: "Multi zigzag angles",
                            de: "Mehrere Zickzackwinkel",
                            ru: "Много зигзагообразных углов",
                            pt: "Ângulos em ziguezague múltiplos",
                            nl: "Meerdere zigzaghoeken",
                            fr: "Angles en zigzag multiples",
                            it: "Angoli a zigzag multipli",
                            es: "Ángulos en zigzag múltiples",
                            pl: "Wielokątne kąty zygzakowate",
                            uk: "Багатокутні зигзаги",
                            "zh-cn": "多锯齿角",
                        },
                        type: "number",
                        role: "level",
                        write: true,
                        read: true,
                        def: 0,
                        states: states,
                    };
                    this.sunseeker.createDataPoint(
                        `${this.namespace}.${sn}.settings.plan_angle`,
                        common,
                        "state",
                        null,
                        null,
                        null,
                    );
                }
            }
        }
    }

    /**
     * @param {string} sn
     * @param {any} data
     */
    async addWriteable(sn, data) {
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
            const cleanup = this.removeNull(payload);
            await this.json2iob.parse(`${sn}.map.info`, cleanup, {
                channelName: {
                    en: "Map info",
                    de: "Karteninformationen",
                    ru: "Информация о карте",
                    pt: "Informações do mapa",
                    nl: "Kaartinformatie",
                    fr: "Informations cartographiques",
                    it: "Informazioni sulla mappa",
                    es: "Información del mapa",
                    pl: "Informacje o mapie",
                    uk: "Інформація про карту",
                    "zh-cn": "地图信息",
                },
                forceIndex: true,
                roles: {
                    mapPathFileUrl: "text.url",
                    realPathFileUlr: "text.url",
                },
            });
            return;
        }
        let common;
        let path = "";
        if (kind === "backup") {
            path = `${sn}.map.backup`;
            if (!this.createObjectDone[path] && this.sunseeker) {
                this.createObjectDone[path] = true;
                common = {
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
                };
                await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
            }
            this.setState(`${sn}.map.backup`, JSON.stringify(payload), true);
            return;
        }
        if (kind === "mapData" || kind === "pathData") {
            if (kind === "mapData") {
                this.checkZone(sn, payload);
            }
            path = `${sn}.map.${kind}`;
            if (!this.createObjectDone[path] && this.sunseeker) {
                this.createObjectDone[path] = true;
                common = {
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
                };
                await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
            }
            this.setState(`${sn}.map.${kind}`, payload, true);
            return;
        }
        // image / wifi / net / texture (data URLs)
        path = `${sn}.map.${kind}`;
        if (!this.createObjectDone[path] && this.sunseeker) {
            this.createObjectDone[path] = true;
            common = {
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
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
        }
        this.setState(`${sn}.map.${kind}`, payload, true);
    }

    /**
     * @param {{ sn: any; update: any; desc: any; fw: any; }} data
     */
    async onSunseekerFirmware(data) {
        this.log.debug(JSON.stringify(data));
        await this.setState(`${data.sn}.settings.firmware_update_available`, { val: data.update, ack: true });
        await this.setState(`${data.sn}.settings.firmware_description`, { val: data.desc, ack: true });
        await this.setState(`${data.sn}.settings.firmware_available`, { val: data.fw, ack: true });
    }

    /**
     * @param {any} data
     */
    async onSunseekerOwn(data) {
        this.log.debug(`own: ${JSON.stringify(data)}`);
        await this.setState(`${data.sn}.expert.response`, { val: JSON.stringify(data.data), ack: true });
    }

    /**
     * @param {{ sn: string; mode: number; }} data
     */
    async onSunseekerScheduleMode(data) {
        await this.setState(`${data.sn}.schedule.schedule_mode`, { val: data.mode, ack: true });
    }

    /**
     * @param {any} payload
     */
    async onSunseekerMqttAuth(payload) {
        const obj = Object.assign({}, payload);
        obj.key = this.encrypt(obj.key);
        await this.setState(`auth.mqtt_connection`, { val: JSON.stringify(obj), ack: true });
    }

    /**
     * @param {any} payload
     */
    async onSunseekerSession(payload) {
        const obj = Object.assign({}, payload);
        obj.access_token = this.encrypt(obj.access_token);
        obj.refresh_token = this.encrypt(obj.refresh_token);
        await this.setState(`auth.session`, { val: JSON.stringify(obj), ack: true });
    }

    async onSunseekerLivemap({ sn, dataUrl }) {
        const path = `${sn}.map.livemap`;
        if (!this.createObjectDone[path] && this.sunseeker) {
            this.createObjectDone[path] = true;
            const common = {
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
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
        }
        this.setState(path, dataUrl, true);
    }

    /**
     * @param {string} sn
     * @param {any} data
     */
    async checkZone(sn, data) {
        if (data && typeof data === "string" && data.startsWith("{")) {
            try {
                const map_info = JSON.parse(data);
                if (map_info && map_info.region_work) {
                    if (!Array.isArray(map_info.region_work)) {
                        return;
                    }
                    await this.json2iob.parse(`${sn}.map.zonen`, map_info.region_work, {
                        forceIndex: true,
                    });
                    const zone = Object.keys(map_info.region_work).length;
                    const obj = await this.getChannelsAsync();
                    const zone_obj = obj.filter(
                        z =>
                            z._id == `${this.namespace}.${sn}.map.zonen.01` ||
                            z._id == `${this.namespace}.${sn}.map.zonen.02` ||
                            z._id == `${this.namespace}.${sn}.map.zonen.03` ||
                            z._id == `${this.namespace}.${sn}.map.zonen.04`,
                    );
                    const zonen = Object.keys(zone_obj).length;
                    if (zonen > zone) {
                        let count = zonen;
                        let save = 0;
                        for (let a = zone; a <= zonen - 1; a++) {
                            this.log.info(`delete zone: ${this.namespace}.${sn}.map.zonen.0${count}`);
                            await this.delObjectAsync(`${this.namespace}.${sn}.map.zonen.0${count}`, {
                                recursive: true,
                            });
                            --count;
                            ++save;
                            if (save > 10) {
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                this.log.error(`checkZone: ${e}`);
            }
        }
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
        if (!this.sunseeker.devicesRaw[parts[2]]) {
            this.log.warn(`onStateChange: Device ${parts[2]} unknown`);
            return;
        }
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
            this.setState(id, { val: false, ack: true });
            return;
        }
        const ownIdx = parts.indexOf("expert");
        const ownSn = parts[ownIdx - 1];
        if (parts[ownIdx + 1] === "request" && state && typeof state.val === "string" && state.val.startsWith("{")) {
            this.sunseeker.ownRequest(ownSn, state.val);
            this.setState(id, { val: state.val, ack: true });
            return;
        }
        const scheduleIdx = parts.indexOf("schedule");
        if (scheduleIdx > 0 && parts[scheduleIdx + 1]) {
            const sn = parts[scheduleIdx - 1];
            const leaf = parts[scheduleIdx + 1];
            if (leaf === "loadSchedule") {
                this.sunseeker.fetchAllProperties(sn);
                this.setState(id, { val: false, ack: true });
                return;
            }
            if (leaf === "schedule_mode") {
                if (this.sunseeker && state.val != null && typeof state.val === "number") {
                    if (state.val == 0 || state.val == 1 || state.val == 2) {
                        this.sunseeker.setScheduleMode(sn, state.val);
                        this.setState(id, { val: false, ack: true });
                    }
                }
                return;
            }
            if (leaf === "set") {
                this.collectSchedulePlan(sn);
                this.setState(id, { val: false, ack: true });
                return;
            }
            if (leaf === "schedule_time_work_repeat") {
                if (typeof state.val === "boolean") {
                    this.sunseeker.setSettings(sn, state.val, "setTimeWorkRepeat", leaf);
                    this.setState(id, { val: state.val, ack: true });
                }
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
            if (leaf === "firmware_update_check_manual") {
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
                    const angle = await this.getStateAsync(`${sn}.settings.plan_angle`);
                    if (angle && typeof angle.val === "number") {
                        this.sunseeker.setPlanMode(sn, state.val, angle.val);
                        this.setState(id, { val: state.val, ack: true });
                    }
                }
                return;
            }
            if (leaf === "plan_angle") {
                if (typeof state.val === "number") {
                    this.setState(id, { val: state.val, ack: true });
                }
                return;
            }
            if (leaf === "dev_name") {
                if (typeof state.val === "string" && state.val != "") {
                    this.sunseeker.setDeviceName(sn, state);
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
        this.log.debug(`cleanUpCalendar: ${plan} - ${JSON.stringify(data)}`);
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
        if (typeof mower_schedule === "object" && mower_schedule !== null) {
            if (!Array.isArray(mower_schedule)) {
                return;
            }
            for (const d of mower_schedule) {
                const day = d.period[0];
                const mower_day_name = dayPeriod[day];
                const mower_time = this.getTimeString(d.start, d.end);
                let path = `${sn}.schedule.${mower_day_name}`;
                if (!schedule[day]) {
                    schedule[day] = true;
                    schedule_empty[day] = true;
                } else {
                    path = `${sn}.schedule.${mower_day_name}_2`;
                    schedule_empty2[day] = true;
                }
                await this.setState(path, { val: mower_time, ack: true });
            }
        }
        if (typeof data.pause === "boolean") {
            await this.setState(`${sn}.schedule.pause`, { val: data.pause, ack: true });
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
     * @param {any} obj
     */
    removeNull(obj) {
        if (typeof obj.firmwareVersion === "number") {
            delete obj.firmwareVersion;
        }
        if (typeof obj.rainDelayDuration === "string") {
            obj.rainDelayDuration = parseInt(obj.rainDelayDuration);
        }
        if (typeof obj.workStatusCode === "number") {
            obj.workStatusCode = obj.workStatusCode.toString();
        }
        return JSON.parse(JSON.stringify(obj), (key, value) => {
            if (value === null) {
                return undefined;
            }
            return value;
        });
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
        let common;
        if (this.config.apptype !== "Old") {
            if (Object.prototype.hasOwnProperty.call(settingsData, "bladeSpeed")) {
                path = `${sn}.settings.bladeSpeed`;
                if (!this.createObjectDone[path] && this.sunseeker) {
                    this.createObjectDone[path] = true;
                    common = {
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
                    };
                    await this.sunseeker.createDataPoint(
                        `${this.namespace}.${path}`,
                        common,
                        "state",
                        null,
                        null,
                        null,
                    );
                }
            }
            if (Object.prototype.hasOwnProperty.call(settingsData, "bladeHeight")) {
                path = `${sn}.settings.bladeHeight`;
                if (!this.createObjectDone[path] && this.sunseeker) {
                    this.createObjectDone[path] = true;
                    common = {
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
                    };
                    await this.sunseeker.createDataPoint(
                        `${this.namespace}.${path}`,
                        common,
                        "state",
                        null,
                        null,
                        null,
                    );
                }
            }
        }
        if (Object.prototype.hasOwnProperty.call(settingsData, "rainFlag")) {
            path = `${sn}.settings.rainFlag`;
            if (!this.createObjectDone[path] && this.sunseeker) {
                this.createObjectDone[path] = true;
                common = {
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
                };
                await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
            }
        }
        if (Object.prototype.hasOwnProperty.call(settingsData, "rainDelayDuration")) {
            path = `${sn}.settings.rainDelayDuration`;
            if (!this.createObjectDone[path] && this.sunseeker) {
                this.createObjectDone[path] = true;
                common = {
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
                };
                await this.sunseeker.createDataPoint(`${this.namespace}.${path}`, common, "state", null, null, null);
            }
        }
    }

    /**
     * @param {string} sn
     * @param {any} data
     */
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
            if (data.time_zone != null) {
                await this.setState(`${sn}.schedule.schedule_time_zone`, { val: data.time_zone, ack: true });
            }
            if (data.time_work_repeat != null) {
                await this.setState(`${sn}.schedule.schedule_time_work_repeat`, {
                    val: data.time_work_repeat,
                    ack: true,
                });
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
            //if (data.dev_model != null) {
            //    await this.setState(`${sn}.settings.dev_model`, { val: data.dev_model, ack: true });
            //}
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
            if (data.bladeHeight != null || (data.blade && data.blade.height != null)) {
                const val = data.bladeHeight != null ? data.bladeHeight : data.blade.height;
                await this.setState(`${sn}.settings.bladeHeight`, { val: val, ack: true });
            }
            if (data.bladeSpeed != null || (data.blade && data.blade.speed != null)) {
                const val = data.bladeSpeed != null ? data.bladeSpeed : data.blade.speed;
                await this.setState(`${sn}.settings.bladeSpeed`, { val: val, ack: true });
            }
        }
    }

    getWeek() {
        const target = new Date();
        const getDay = target.getDay();
        const dayNr = (target.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const jan4 = new Date(target.getFullYear(), 0, 4);
        const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
        if (new Date(target.getFullYear(), 0, 1).getDay() < 5) {
            return `${1 + Math.ceil(dayDiff / 7)}-${getDay}`;
        }
        return `${Math.ceil(dayDiff / 7)}-${getDay}`;
    }

    async createAuth() {
        if (this.sunseeker) {
            let common;
            common = {
                name: {
                    en: "Auth Information",
                    de: "Authentifizierungsinformationen",
                    ru: "Информация об аутентификации",
                    pt: "Informações de autorização",
                    nl: "Autorisatie-informatie",
                    fr: "Informations d'autorisation",
                    it: "Informazioni di autorizzazione",
                    es: "Información de autorización",
                    pl: "Informacje o uwierzytelnianiu",
                    uk: "Інформація для авторизації",
                    "zh-cn": "授权信息",
                },
                desc: "Create by Adapter",
                icon: "img/auth.png",
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.auth`, common, "channel", null, null, null);
            common = {
                name: {
                    en: "Rate Limit",
                    de: "Ratenbegrenzung",
                    ru: "Лимит скорости",
                    pt: "Limite de taxa",
                    nl: "Snelheidslimiet",
                    fr: "Limite de débit",
                    it: "Limite di tariffa",
                    es: "Límite de tasa",
                    pl: "Limit szybkości",
                    uk: "Ліміт швидкості",
                    "zh-cn": "速率限制",
                },
                desc: "Create by Adapter",
                icon: "img/rate.png",
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.rateLimit`, common, "channel", null, null, null);
            common = {
                name: {
                    en: "Session",
                    de: "Sitzung",
                    ru: "Сессия",
                    pt: "Sessão",
                    nl: "Sessie",
                    fr: "Session",
                    it: "Sessione",
                    es: "Sesión",
                    pl: "Sesja",
                    uk: "Сесія",
                    "zh-cn": "会议",
                },
                type: "string",
                role: "json",
                desc: "Create by Adapter",
                read: true,
                write: false,
                def: JSON.stringify({}),
            };
            await this.sunseeker.createDataPoint(`${this.namespace}.auth.session`, common, "state", null, null, null);
            common = {
                name: {
                    en: "Mqtt connection",
                    de: "MQTT-Verbindung",
                    ru: "MQTT-соединение",
                    pt: "Conexão MQTT",
                    nl: "MQTT-verbinding",
                    fr: "Connexion MQTT",
                    it: "Connessione MQTT",
                    es: "conexión MQTT",
                    pl: "Połączenie MQTT",
                    uk: "З'єднання Mqtt",
                    "zh-cn": "MQTT 连接",
                },
                type: "string",
                role: "json",
                desc: "Create by Adapter",
                read: true,
                write: false,
                def: JSON.stringify({}),
            };
            await this.sunseeker.createDataPoint(
                `${this.namespace}.auth.mqtt_connection`,
                common,
                "state",
                null,
                null,
                null,
            );
            common = {
                name: {
                    en: "Restart Limit",
                    de: "Neustartlimit",
                    ru: "Ограничение перезапуска",
                    pt: "Limite de reinicialização",
                    nl: "Herstartlimiet",
                    fr: "Limite de redémarrage",
                    it: "Limite di riavvio",
                    es: "Límite de reinicio",
                    pl: "Limit ponownego uruchomienia",
                    uk: "Ліміт перезапуску",
                    "zh-cn": "重启限制",
                },
                type: "string",
                role: "json",
                desc: "Create by Adapter",
                read: true,
                write: false,
                def: JSON.stringify({
                    restartCount: 0,
                    restartLast: 0,
                    restartTime: "",
                    day: "",
                }),
            };
            await this.sunseeker.createDataPoint(
                `${this.namespace}.rateLimit.restart`,
                common,
                "state",
                null,
                null,
                null,
            );
        }
    }

    async setRestartCount() {
        await this.setState(`rateLimit.restart`, { val: JSON.stringify(this.restartLimit), ack: true });
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
