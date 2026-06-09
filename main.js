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

        this.sunseeker = new Sunseeker(cfg.username, cfg.password, {
            region: cfg.region || "EU",
            apptype: cfg.apptype || "New",
            language: cfg.language || "de-DE",
            interval: Number(cfg.interval) > 0 ? Number(cfg.interval) : 300,
            refreshAfterMqttMs: 1500,
            logger,
            iobTimers,
        });

        this.sunseeker.on("devices", payload => this.onSunseekerDevices(payload));
        this.sunseeker.on("records", payload => this.onSunseekerRecords(payload));
        this.sunseeker.on("status", payload => this.onSunseekerStatus(payload));
        this.sunseeker.on("mqtt", payload => this.onSunseekerMqtt(payload));
        this.sunseeker.on("map", payload => this.onSunseekerMap(payload));
        this.sunseeker.on("livemap", payload => this.onSunseekerLivemap(payload));
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
            if (this.sunseeker) {
                const meta = this.sunseeker.deviceMeta[sn];
                if (meta && (meta.modelClass === "S" || d.modelClass === "X")) {
                    await this.extendObject(`${sn}.map`, {
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
                }
            }
            await this.delObjectAsync(`${sn}.list`, { recursive: true }).catch(() => {});
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
            await this.ensureRemoteButtons(sn);
            await this.ensureScheduleStates(sn);
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

    onSunseekerMqtt({ sn, data, id }) {
        if (!data) {
            return;
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

    async addWriteable(sn, data) {
        this.log.debug(`ID: ${sn}`);
        this.firstStartTimeout = this.setTimeout(async () => {
            this.firstStartTimeout = null;
            if (data && data.night_work != null) {
                await this.extendObject(`${sn}.settings.night_work`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Mowing at night",
                            de: "Mähen bei Nacht",
                            ru: "Кошение травы ночью",
                            pt: "Cortar a grama à noite",
                            nl: "'s Nachts maaien",
                            fr: "Tondre la nuit",
                            it: "Falciare di notte",
                            es: "Cortar el césped por la noche.",
                            pl: "Koszenie w nocy",
                            uk: "Косіння вночі",
                            "zh-cn": "夜间割草",
                        },
                        type: "boolean",
                        role: "switch",
                        write: true,
                        read: true,
                        def: false,
                    },
                    native: {},
                });
            }
            if (data && data.recharge_mode != null) {
                await this.extendObject(`${sn}.settings.recharge_mode`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Docking Path",
                            de: "Andockpfad",
                            ru: "Путь стыковки",
                            pt: "Caminho de ancoragem",
                            nl: "Dokpad",
                            fr: "Chemin d'amarrage",
                            it: "Percorso di attracco",
                            es: "Ruta de acoplamiento",
                            pl: "Ścieżka dokowania",
                            uk: "Шлях стикування",
                            "zh-cn": "对接路径",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            0: "direct path",
                            1: "smart",
                            2: "along edge",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.work_touch_mode != null) {
                await this.extendObject(`${sn}.settings.work_touch_mode`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Obstacle Avoidance Strategy",
                            de: "Strategie zur Vermeidung von Hindernissen",
                            ru: "Стратегия избегания препятствий",
                            pt: "Estratégia para Evitar Obstáculos",
                            nl: "Obstakelvermijdingsstrategie",
                            fr: "Stratégie d'évitement des obstacles",
                            it: "Strategia di evitamento degli ostacoli",
                            es: "Estrategia para evitar obstáculos",
                            pl: "Strategia unikania przeszkód",
                            uk: "Стратегія уникнення перешкод",
                            "zh-cn": "避障策略",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            0: "no touch",
                            1: "slow touch",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.auto_ride_edge_map_m != null) {
                await this.extendObject(`${sn}.settings.auto_ride_edge_map_m`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Automatic Edge Mapping",
                            de: "Automatische Kantenerkennung",
                            ru: "Автоматическое отображение границ",
                            pt: "Mapeamento automático de bordas",
                            nl: "Automatische randmapping",
                            fr: "Cartographie automatique des bords",
                            it: "Mappatura automatica dei bordi",
                            es: "Mapeo automático de bordes",
                            pl: "Automatyczne mapowanie krawędzi",
                            uk: "Автоматичне картографування країв",
                            "zh-cn": "自动边缘映射",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            0: "not enabled",
                            1: "enabled",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.dis_along_border != null) {
                await this.extendObject(`${sn}.settings.dis_along_border`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Edge Distance",
                            de: "Randabstand",
                            ru: "Расстояние до края",
                            pt: "distância da borda",
                            nl: "Randafstand",
                            fr: "Distance au bord",
                            it: "Distanza dal bordo",
                            es: "Distancia al borde",
                            pl: "Odległość od krawędzi",
                            uk: "Відстань від краю",
                            "zh-cn": "边缘距离",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            0: "close",
                            1: "far",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.first_along_border != null) {
                await this.extendObject(`${sn}.settings.first_along_border`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Mowing Preference",
                            de: "Mähpräferenz",
                            ru: "Предпочтения по стрижке газона",
                            pt: "Preferência de corte de grama",
                            nl: "Voorkeur voor maaien",
                            fr: "Préférence de tonte",
                            it: "Preferenza di taglio",
                            es: "Preferencia de corte",
                            pl: "Preferencje dotyczące koszenia",
                            uk: "Уподобання щодо скошування",
                            "zh-cn": "割草偏好",
                        },
                        type: "boolean",
                        role: "switch",
                        write: true,
                        read: true,
                        def: false,
                    },
                    native: {},
                });
            }
            if (data && data.time_work_repeat != null) {
                await this.extendObject(`${sn}.settings.time_work_repeat`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Time work to repeat",
                            de: "Zeitarbeit wiederholen",
                            ru: "Время для работы, чтобы повторить",
                            pt: "Tempo de trabalho para repetir",
                            nl: "Tijd om te herhalen",
                            fr: "Il faut répéter le travail.",
                            it: "Tempo di lavoro da ripetere",
                            es: "El tiempo de trabajo se repite",
                            pl: "Praca nad czasem do powtórzenia",
                            uk: "Час роботи для повторення",
                            "zh-cn": "重复工作的时间",
                        },
                        type: "boolean",
                        role: "switch",
                        write: true,
                        read: true,
                        def: false,
                    },
                    native: {},
                });
            }
            if (data && data.energy_saving_mode != null) {
                await this.extendObject(`${sn}.settings.energy_saving_mode`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Energy saving mode",
                            de: "Energiesparmodus",
                            ru: "режим энергосбережения",
                            pt: "Modo de economia de energia",
                            nl: "Energiebesparende modus",
                            fr: "mode d'économie d'énergie",
                            it: "Modalità di risparmio energetico",
                            es: "Modo de ahorro de energía",
                            pl: "Tryb oszczędzania energii",
                            uk: "Режим енергозбереження",
                            "zh-cn": "节能模式",
                        },
                        type: "boolean",
                        role: "switch",
                        write: true,
                        read: true,
                        def: false,
                    },
                    native: {},
                });
            }
            if (data && data.follow_border_freq != null) {
                await this.extendObject(`${sn}.settings.follow_border_freq`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Edge Cutting Frequency",
                            de: "Kantenschneidfrequenz",
                            ru: "Частота резки кромок",
                            pt: "Frequência de corte de borda",
                            nl: "Snijfrequentie van de kanten",
                            fr: "Fréquence de coupe des bords",
                            it: "Frequenza di taglio del bordo",
                            es: "Frecuencia de corte de filo",
                            pl: "Częstotliwość cięcia krawędzi",
                            uk: "Частота різання країв",
                            "zh-cn": "边缘切削频率",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            1: "everytime",
                            2: "every second time",
                            3: "every third time",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.dev_name != null) {
                await this.extendObject(`${sn}.settings.dev_name`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Device name",
                            de: "Name des Geräts",
                            ru: "Имя устройства",
                            pt: "Nome do dispositivo",
                            nl: "Apparaatnaam",
                            fr: "Nom du périphérique",
                            it: "Nome del dispositivo",
                            es: "Nombre del dispositivo",
                            pl: "Nazwa urządzenia",
                            uk: "Назва пристрою",
                            "zh-cn": "设备名称",
                        },
                        type: "string",
                        role: "state",
                        write: true,
                        read: true,
                    },
                    native: {},
                });
            }
            if (data && data.dev_model != null) {
                await this.extendObject(`${sn}.settings.dev_model`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Device model",
                            de: "Gerätemodell",
                            ru: "модель устройства",
                            pt: "Modelo do dispositivo",
                            nl: "Apparaatmodel",
                            fr: "Modèle d'appareil",
                            it: "Modello del dispositivo",
                            es: "Modelo de dispositivo",
                            pl: "Model urządzenia",
                            uk: "Модель пристрою",
                            "zh-cn": "设备型号",
                        },
                        type: "string",
                        role: "state",
                        write: true,
                        read: true,
                    },
                    native: {},
                });
            }
            if (data && data.ai_sensitivity != null) {
                await this.extendObject(`${sn}.settings.ai_sensitivity`, {
                    type: "state",
                    common: {
                        name: {
                            en: "AI sensitivity",
                            de: "KI-Sensitivität",
                            ru: "чувствительность ИИ",
                            pt: "Sensibilidade da IA",
                            nl: "AI-gevoeligheid",
                            fr: "sensibilité de l'IA",
                            it: "sensibilità dell'IA",
                            es: "Sensibilidad de la IA",
                            pl: "Wrażliwość AI",
                            uk: "Чутливість штучного інтелекту",
                            "zh-cn": "人工智能敏感性",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            0: "low",
                            1: "high",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.plan_angle != null && data.plan_angle.plan_mode != null) {
                await this.extendObject(`${sn}.settings.plan_mode`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Cutting Direction",
                            de: "Schnittrichtung",
                            ru: "Направление резки",
                            pt: "Direção de corte",
                            nl: "Snijrichting",
                            fr: "Direction de coupe",
                            it: "Direzione di taglio",
                            es: "Dirección de corte",
                            pl: "Kierunek cięcia",
                            uk: "Напрямок різання",
                            "zh-cn": "切割方向",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 0,
                        states: {
                            0: "default",
                            1: "traceless",
                            4: "multi-angle",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.mow_efficiency != null && data.mow_efficiency.speed != null) {
                await this.extendObject(`${sn}.settings.workSpeed`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Mowing Speed",
                            de: "Mähgeschwindigkeit",
                            ru: "Скорость кошения",
                            pt: "Velocidade de corte",
                            nl: "Maaisnelheid",
                            fr: "Vitesse de tonte",
                            it: "Velocità di taglio",
                            es: "Velocidad de corte",
                            pl: "Prędkość koszenia",
                            uk: "Швидкість скошування",
                            "zh-cn": "割草速度",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 2,
                        states: {
                            1: "slow",
                            2: "standard",
                            3: "fast",
                        },
                    },
                    native: {},
                });
            }
            if (data && data.mow_efficiency != null && data.mow_efficiency.gap != null) {
                await this.extendObject(`${sn}.settings.gap`, {
                    type: "state",
                    common: {
                        name: {
                            en: "Cutting Spacing",
                            de: "Schneiden Abstand",
                            ru: "Расстояние между режущими инструментами",
                            pt: "Espaçamento de corte",
                            nl: "Snijafstand",
                            fr: "Espacement de coupe",
                            it: "Spazio di taglio",
                            es: "Espaciado de corte",
                            pl: "Odstępy między cięciami",
                            uk: "Інтервал різання",
                            "zh-cn": "切割间距",
                        },
                        type: "number",
                        role: "value",
                        write: true,
                        read: true,
                        def: 2,
                        states: {
                            1: "narrow",
                            2: "standard",
                            3: "wide",
                        },
                    },
                    native: {},
                });
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
        if (kind === "backup") {
            await this.extendObject(`${sn}.map.backup`, {
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
            this.setState(`${sn}.map.backup`, JSON.stringify(payload), true);
            return;
        }
        if (kind === "mapData" || kind === "pathData") {
            await this.extendObject(`${sn}.map.${kind}`, {
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
            this.setState(`${sn}.map.${kind}`, payload, true);
            return;
        }
        // image / wifi / net / texture (data URLs)
        await this.extendObject(`${sn}.map.${kind}`, {
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
        this.setState(`${sn}.map.${kind}`, payload, true);
    }

    async onSunseekerLivemap({ sn, dataUrl }) {
        await this.extendObject(`${sn}.map.livemap`, {
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
        const scheduleIdx = parts.indexOf("schedule");
        if (scheduleIdx > 0 && parts[scheduleIdx + 1]) {
            const sn = parts[scheduleIdx - 1];
            const leaf = parts[scheduleIdx + 1];
            if (leaf === "set") {
                try {
                    const plan = await this.collectSchedulePlan(sn);
                    await this.sunseeker.setSchedule(sn, plan);
                    this.updateDeviceSet = this.setTimeout(
                        () => this.sunseeker?.updateDevice(sn).catch(() => {}),
                        1500,
                    );
                    this.setState(id, { val: false, ack: true });
                } catch (err) {
                    this.log.error(`Schedule for ${sn} failed: ${err.message}`);
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
     */
    async collectSchedulePlan(sn) {
        const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        const plan = {};
        for (const day of days) {
            const st = await this.getStateAsync(`${sn}.schedule.${day}`);
            plan[day] = st && st.val ? String(st.val) : "";
        }
        const pauseSt = await this.getStateAsync(`${sn}.schedule.pause`);
        plan.pause = !!(pauseSt && pauseSt.val);
        return plan;
    }

    /**
     * @param {string} sn
     */
    async ensureRemoteButtons(sn) {
        await this.extendObject(`${sn}.remote`, {
            type: "channel",
            common: {
                name: {
                    en: "Commands",
                    de: "Befehle",
                    ru: "Команды",
                    pt: "Comandos",
                    nl: "Commando's",
                    fr: "Commandes",
                    it: "Comandi",
                    es: "Comandos",
                    pl: "Polecenia",
                    uk: "Команди",
                    "zh-cn": "命令",
                },
            },
            native: {},
        });
        const buttons = [
            [
                "start",
                {
                    en: "Mowing start",
                    de: "Mähen starten",
                    ru: "Начало кошения",
                    pt: "Início da poda",
                    nl: "Maaien begint",
                    fr: "Début de la tonte",
                    it: "Inizio falciatura",
                    es: "Inicio del corte de césped",
                    pl: "Rozpoczęcie koszenia",
                    uk: "Початок скошування",
                    "zh-cn": "割草开始",
                },
            ],
            [
                "pause",
                {
                    en: "Pause",
                    de: "Pause",
                    ru: "Пауза",
                    pt: "Pausa",
                    nl: "Pauze",
                    fr: "Pause",
                    it: "Pausa",
                    es: "Pausa",
                    pl: "Pauza",
                    uk: "Пауза",
                    "zh-cn": "暂停",
                },
            ],
            [
                "dock",
                {
                    en: "To the Charging Station",
                    de: "Zur Ladestation",
                    ru: "К зарядной станции",
                    pt: "Para a estação de carregamento",
                    nl: "Naar het laadstation",
                    fr: "Vers la station de recharge",
                    it: "Alla stazione di ricarica",
                    es: "A la estación de carga",
                    pl: "Do stacji ładowania",
                    uk: "До зарядної станції",
                    "zh-cn": "前往充电站",
                },
            ],
            [
                "stop_find_charger",
                {
                    en: "Trip to home cancel",
                    de: "Heimreise abbrechen",
                    ru: "Отмена поездки домой",
                    pt: "Cancelamento da viagem para casa",
                    nl: "Reis naar huis geannuleerd",
                    fr: "Annulation du voyage à domicile",
                    it: "Annulla il viaggio verso casa",
                    es: "Cancelación del viaje a casa",
                    pl: "Odwołanie podróży do domu",
                    uk: "Скасувати поїздку додому",
                    "zh-cn": "取消回家行程",
                },
            ],
            [
                "border",
                {
                    en: "Edge cut run",
                    de: "Kantenschnittlauf",
                    ru: "Краевой срез",
                    pt: "corte de borda",
                    nl: "Randafsnijding",
                    fr: "Course de coupe de bord",
                    it: "Taglio del bordo",
                    es: "Corte de borde",
                    pl: "Cięcie krawędziowe",
                    uk: "Вирізання краю",
                    "zh-cn": "边缘切割",
                },
            ],
            [
                "stop",
                {
                    en: "Stop",
                    de: "Stoppen",
                    ru: "Останавливаться",
                    pt: "Parar",
                    nl: "Stop",
                    fr: "Arrêt",
                    it: "Fermare",
                    es: "Detener",
                    pl: "Zatrzymywać się",
                    uk: "СТІЙ",
                    "zh-cn": "停止",
                },
            ],
            [
                "stop_task",
                {
                    en: "Cancel Task",
                    de: "Aufgabe abbrechen",
                    ru: "Отменить задачу",
                    pt: "Cancelar tarefa",
                    nl: "Taak annuleren",
                    fr: "Annuler la tâche",
                    it: "Annulla attività",
                    es: "Cancelar tarea",
                    pl: "Anuluj zadanie",
                    uk: "Скасувати завдання",
                    "zh-cn": "取消任务",
                },
            ],
            [
                "restart",
                {
                    en: "Restart Task",
                    de: "Aufgabe neu starten",
                    ru: "Перезапустить задачу",
                    pt: "Reiniciar tarefa",
                    nl: "Taak opnieuw starten",
                    fr: "Tâche de redémarrage",
                    it: "Riavvia l'attività",
                    es: "Reiniciar tarea",
                    pl: "Uruchom ponownie zadanie",
                    uk: "Перезапустити завдання",
                    "zh-cn": "重启任务",
                },
            ],
            [
                "refresh",
                {
                    en: "Reload Status",
                    de: "Status neu laden",
                    ru: "Статус перезагрузки",
                    pt: "Recarregar status",
                    nl: "Herlaadstatus",
                    fr: "État du rechargement",
                    it: "Stato ricarica",
                    es: "Estado de recarga",
                    pl: "Status ponownego ładowania",
                    uk: "Стан поповнення",
                    "zh-cn": "重新加载状态",
                },
            ],
            [
                "refresh_property",
                {
                    en: "Reload Properties",
                    de: "Eigenschaften neu laden",
                    ru: "Перезагрузить свойства",
                    pt: "Recarregar propriedades",
                    nl: "Eigenschappen opnieuw laden",
                    fr: "Recharger les propriétés",
                    it: "Ricarica le proprietà",
                    es: "Recargar propiedades",
                    pl: "Załaduj ponownie właściwości",
                    uk: "Перезавантажити властивості",
                    "zh-cn": "重新加载属性",
                },
            ],
        ];
        for (const [id, name] of buttons) {
            await this.extendObject(`${sn}.remote.${id}`, {
                type: "state",
                common: {
                    name: name,
                    type: "boolean",
                    role: "button",
                    read: false,
                    write: true,
                    def: false,
                },
                native: {},
            });
        }
    }

    /**
     * @param {string} sn
     */
    async ensureScheduleStates(sn) {
        await this.extendObject(`${sn}.schedule`, {
            type: "channel",
            common: {
                name: {
                    en: "Schedule Planner",
                    de: "Terminplaner",
                    ru: "Планировщик расписаний",
                    pt: "Planejador de Horários",
                    nl: "Planningsplanner",
                    fr: "Planificateur d'horaire",
                    it: "Pianificatore di programmi",
                    es: "Planificador de horarios",
                    pl: "Planer harmonogramu",
                    uk: "Планувальник розкладу",
                    "zh-cn": "日程规划器",
                },
            },
            native: {},
        });
        const days = [
            [
                "monday",
                {
                    en: "Monday (HH:MM-HH:MM, empty = off)",
                    de: "Montag (HH:MM-HH:MM, leer = aus)",
                    ru: "Понедельник (ЧЧ:ММ-ЧЧ:ММ, пустой = выключен)",
                    pt: "Segunda-feira (HH:MM-HH:MM, vazio = desligado)",
                    nl: "Maandag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Lundi (HH:MM-HH:MM, vide = désactivé)",
                    it: "Lunedì (HH:MM-HH:MM, vuoto = chiuso)",
                    es: "Lunes (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Poniedziałek (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "Понеділок (ГГ:ХХ-ГГ:ХХ, порожній = вихідний)",
                    "zh-cn": "星期一（HH:MM-HH:MM，空表示休息）",
                },
            ],
            [
                "tuesday",
                {
                    en: "Tuesday (HH:MM-HH:MM, empty = off)",
                    de: "Dienstag (HH:MM-HH:MM, leer = aus)",
                    ru: "Вторник (ЧЧ:ММ-ЧЧ:ММ, пусто = выключено)",
                    pt: "Terça-feira (HH:MM-HH:MM, vazio = desligado)",
                    nl: "Dinsdag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Mardi (HH:MM-HH:MM, vide = désactivé)",
                    it: "Martedì (HH:MM-HH:MM, vuoto = spento)",
                    es: "Martes (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Wtorek (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "Вівторок (ГГ:ХХ-ГГ:ХХ, порожній = вихідний)",
                    "zh-cn": "星期二（HH:MM-HH:MM，空表示休息）",
                },
            ],
            [
                "wednesday",
                {
                    en: "Wednesday (HH:MM-HH:MM, empty = off)",
                    de: "Mittwoch (HH:MM-HH:MM, leer = aus)",
                    ru: "Среда (ЧЧ:ММ-ЧЧ:ММ, пусто = выключено)",
                    pt: "Quarta-feira (HH:MM-HH:MM, vazio = fechado)",
                    nl: "Woensdag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Mercredi (HH:MM-HH:MM, vide = désactivé)",
                    it: "Mercoledì (HH:MM-HH:MM, vuoto = spento)",
                    es: "Miércoles (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Środa (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "Середа (ГГ:ХХ-ГГ:ХХ, порожній = вимкнено)",
                    "zh-cn": "星期三（HH:MM-HH:MM，空表示休息）",
                },
            ],
            [
                "thursday",
                {
                    en: "Thursday (HH:MM-HH:MM, empty = off)",
                    de: "Donnerstag (HH:MM-HH:MM, leer = aus)",
                    ru: "Четверг (ЧЧ:ММ-ЧЧ:ММ, пусто = выключено)",
                    pt: "Quinta-feira (HH:MM-HH:MM, vazio = fechado)",
                    nl: "Donderdag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Jeudi (HH:MM-HH:MM, vide = désactivé)",
                    it: "Giovedì (HH:MM-HH:MM, vuoto = non disponibile)",
                    es: "Jueves (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Czwartek (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "Четвер (ГГ:ХХ-ГГ:ХХ, порожній = вихідний)",
                    "zh-cn": "星期四（HH:MM-HH:MM，空表示休息）",
                },
            ],
            [
                "friday",
                {
                    en: "Friday (HH:MM-HH:MM, empty = off)",
                    de: "Freitag (HH:MM-HH:MM, leer = aus)",
                    ru: "Пятница (ЧЧ:ММ-ЧЧ:ММ, пусто = выключено)",
                    pt: "Sexta-feira (HH:MM-HH:MM, vazio = fechado)",
                    nl: "Vrijdag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Vendredi (HH:MM-HH:MM, vide = désactivé)",
                    it: "Venerdì (HH:MM-HH:MM, vuoto = non disponibile)",
                    es: "Viernes (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Piątek (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "П'ятниця (ГГ:ХХ-ГГ:ХХ, порожній = вихідний)",
                    "zh-cn": "星期五（HH:MM-HH:MM，空表示休息）",
                },
            ],
            [
                "saturday",
                {
                    en: "Saturday (HH:MM-HH:MM, empty = off)",
                    de: "Samstag (HH:MM-HH:MM, leer = aus)",
                    ru: "Суббота (ЧЧ:ММ-ЧЧ:ММ, пусто = выключено)",
                    pt: "Sábado (HH:MM-HH:MM, vazio = fechado)",
                    nl: "Zaterdag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Samedi (HH:MM-HH:MM, vide = désactivé)",
                    it: "Sabato (HH:MM-HH:MM, vuoto = chiuso)",
                    es: "Sábado (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Sobota (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "Субота (ГГ:ХХ-ГГ:ХХ, порожній = вихідний)",
                    "zh-cn": "星期六（HH:MM-HH:MM，空表示休息）",
                },
            ],
            [
                "sunday",
                {
                    en: "Sunday (HH:MM-HH:MM, empty = off)",
                    de: "Sonntag (HH:MM-HH:MM, leer = aus)",
                    ru: "Воскресенье (ЧЧ:ММ-ЧЧ:ММ, пусто = выключено)",
                    pt: "Domingo (HH:MM-HH:MM, vazio = desligado)",
                    nl: "Zondag (HH:MM-HH:MM, leeg = uit)",
                    fr: "Dimanche (HH:MM-HH:MM, vide = désactivé)",
                    it: "Domenica (HH:MM-HH:MM, vuoto = chiuso)",
                    es: "Domingo (HH:MM-HH:MM, vacío = apagado)",
                    pl: "Niedziela (GG:MM-GG:MM, puste = wyłączone)",
                    uk: "Неділя (ГГ:ХХ-ГГ:ХХ, порожній = вихідний)",
                    "zh-cn": "星期日（HH:MM-HH:MM，空表示休息）",
                },
            ],
        ];
        for (const [key, label] of days) {
            await this.extendObject(`${sn}.schedule.${key}`, {
                type: "state",
                common: {
                    name: label,
                    type: "string",
                    role: "text",
                    read: true,
                    write: true,
                    def: "",
                },
                native: {},
            });
        }
        await this.extendObject(`${sn}.schedule.pause`, {
            type: "state",
            common: {
                name: {
                    en: "Schedule paused",
                    de: "Zeitplan pausiert",
                    ru: "Расписание приостановлено",
                    pt: "Programação pausada",
                    nl: "Planning gepauzeerd",
                    fr: "Programme suspendu",
                    it: "Programma sospeso",
                    es: "Programación pausada",
                    pl: "Harmonogram wstrzymany",
                    uk: "Розклад призупинено",
                    "zh-cn": "行程暂停",
                },
                type: "boolean",
                role: "switch",
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        await this.extendObject(`${sn}.schedule.set`, {
            type: "state",
            common: {
                name: {
                    en: "Send schedule",
                    de: "Zeitplan senden",
                    ru: "Отправить расписание",
                    pt: "Enviar cronograma",
                    nl: "Schema verzenden",
                    fr: "Envoyer le planning",
                    it: "Invia programma",
                    es: "Enviar horario",
                    pl: "Wyślij harmonogram",
                    uk: "Надіслати розклад",
                    "zh-cn": "发送日程安排",
                },
                type: "boolean",
                role: "button",
                read: false,
                write: true,
                def: false,
            },
            native: {},
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
