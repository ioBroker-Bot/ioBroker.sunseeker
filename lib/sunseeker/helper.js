module.exports = {
    /**
     * @param {string} sn
     * @param {any} data
     * @param {ioBroker.Adapter} iob
     */
    async createSettings(sn, data, iob) {
        if (data.night_work != null) {
            await iob.extendObject(`${sn}.settings.night_work`, {
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
        if (data.recharge_mode != null) {
            await iob.extendObject(`${sn}.settings.recharge_mode`, {
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
        if (data.work_touch_mode != null) {
            await iob.extendObject(`${sn}.settings.work_touch_mode`, {
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
        if (data.auto_ride_edge_map_m != null) {
            await iob.extendObject(`${sn}.settings.auto_ride_edge_map_m`, {
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
        if (data.dis_along_border != null) {
            await iob.extendObject(`${sn}.settings.dis_along_border`, {
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
        if (data.first_along_border != null) {
            await iob.extendObject(`${sn}.settings.first_along_border`, {
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
        if (data.time_work_repeat != null) {
            await iob.extendObject(`${sn}.settings.time_work_repeat`, {
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
        if (data.energy_saving_mode != null) {
            await iob.extendObject(`${sn}.settings.energy_saving_mode`, {
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
        if (data.follow_border_freq != null) {
            await iob.extendObject(`${sn}.settings.follow_border_freq`, {
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
        if (data.dev_name != null) {
            await iob.extendObject(`${sn}.settings.dev_name`, {
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
        if (data.dev_model != null) {
            await iob.extendObject(`${sn}.settings.dev_model`, {
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
        if (data.ai_sensitivity != null) {
            await iob.extendObject(`${sn}.settings.ai_sensitivity`, {
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
        if (data.plan_angle != null && data.plan_angle.plan_mode != null) {
            await iob.extendObject(`${sn}.settings.plan_mode`, {
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
        if (data.mow_efficiency != null && data.mow_efficiency.speed != null) {
            await iob.extendObject(`${sn}.settings.workSpeed`, {
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
        if (data.mow_efficiency != null && data.mow_efficiency.gap != null) {
            await iob.extendObject(`${sn}.settings.gap`, {
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
        await iob.extendObject(`${sn}.settings.firmware_available`, {
            type: "state",
            common: {
                name: {
                    en: "Firmware available",
                    de: "Firmware verfügbar",
                    ru: "Доступна прошивка",
                    pt: "Firmware disponível",
                    nl: "Firmware beschikbaar",
                    fr: "Firmware disponible",
                    it: "Firmware disponibile",
                    es: "Firmware disponible",
                    pl: "Dostępne oprogramowanie układowe",
                    uk: "Доступна прошивка",
                    "zh-cn": "固件可用",
                },
                type: "string",
                role: "state",
                write: false,
                read: true,
            },
            native: {},
        });
        await iob.extendObject(`${sn}.settings.firmware_description`, {
            type: "state",
            common: {
                name: {
                    en: "Firmware description",
                    de: "Firmware-Beschreibung",
                    ru: "Описание прошивки",
                    pt: "Descrição do firmware",
                    nl: "Firmwarebeschrijving",
                    fr: "Description du firmware",
                    it: "Descrizione del firmware",
                    es: "Descripción del firmware",
                    pl: "Opis oprogramowania sprzętowego",
                    uk: "Опис прошивки",
                    "zh-cn": "固件描述",
                },
                type: "string",
                role: "state",
                write: false,
                read: true,
            },
            native: {},
        });
        await iob.extendObject(`${sn}.settings.firmware_update_available`, {
            type: "state",
            common: {
                name: {
                    en: "Firmware update available",
                    de: "Firmware-Update verfügbar",
                    ru: "Доступно обновление прошивки",
                    pt: "Atualização de firmware disponível",
                    nl: "Firmware-update beschikbaar",
                    fr: "Mise à jour du firmware disponible",
                    it: "Aggiornamento del firmware disponibile",
                    es: "Actualización de firmware disponible",
                    pl: "Dostępna aktualizacja oprogramowania sprzętowego",
                    uk: "Доступне оновлення прошивки",
                    "zh-cn": "固件更新可用",
                },
                type: "boolean",
                role: "switch",
                write: false,
                read: true,
                def: false,
            },
            native: {},
        });
        await iob.extendObject(`${sn}.settings.firmware_update_start`, {
            type: "state",
            common: {
                name: {
                    en: "Start firmware update",
                    de: "Firmware-Update starten",
                    ru: "Начать обновление прошивки",
                    pt: "Iniciar atualização de firmware",
                    nl: "Start de firmware-update",
                    fr: "Lancer la mise à jour du firmware",
                    it: "Avviare l'aggiornamento del firmware",
                    es: "Iniciar actualización del firmware",
                    pl: "Rozpocznij aktualizację oprogramowania układowego",
                    uk: "Розпочати оновлення прошивки",
                    "zh-cn": "开始固件更新",
                },
                type: "boolean",
                role: "button",
                write: true,
                read: false,
                def: false,
            },
            native: {},
        });
    },
};
