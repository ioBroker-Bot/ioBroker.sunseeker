module.exports = {
    /**
     * @param {string} sn
     * @param {any} data
     */
    async createSettings(sn, data) {
        if (data.night_work != null) {
            await this.iobObject.extendObject(`${sn}.settings.night_work`, {
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
            await this.iobObject.extendObject(`${sn}.settings.recharge_mode`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.work_touch_mode`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.auto_ride_edge_map_m`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.dis_along_border`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.first_along_border`, {
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
        if (data.energy_saving_mode != null) {
            await this.iobObject.extendObject(`${sn}.settings.energy_saving_mode`, {
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
            await this.iobObject.extendObject(`${sn}.settings.follow_border_freq`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.dev_name`, {
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
            await this.iobObject.extendObject(`${sn}.settings.dev_model`, {
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
            await this.iobObject.extendObject(`${sn}.settings.ai_sensitivity`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.plan_mode`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.workSpeed`, {
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
                    role: "level",
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
            await this.iobObject.extendObject(`${sn}.settings.gap`, {
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
                    role: "level",
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
    },
    /**
     * @param {string} sn
     */
    async createSettingsFW(sn) {
        await this.iobObject.extendObject(`${sn}.settings.firmware_available`, {
            type: "state",
            common: {
                name: {
                    en: "available firmware",
                    de: "verfügbare Firmware",
                    ru: "доступная прошивка",
                    pt: "firmware disponível",
                    nl: "beschikbare firmware",
                    fr: "micrologiciel disponible",
                    it: "firmware disponibile",
                    es: "firmware disponible",
                    pl: "dostępne oprogramowanie układowe",
                    uk: "доступна прошивка",
                    "zh-cn": "可用固件",
                },
                type: "string",
                role: "state",
                write: false,
                read: true,
            },
            native: {},
        });
        await this.iobObject.extendObject(`${sn}.settings.firmware_description`, {
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
        await this.iobObject.extendObject(`${sn}.settings.firmware_update_available`, {
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
        await this.iobObject.extendObject(`${sn}.settings.firmware_update_start`, {
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
        await this.iobObject.extendObject(`${sn}.settings.firmware_update_check_manuel`, {
            type: "state",
            common: {
                name: {
                    en: "Manuelly testing whether an update is available",
                    de: "Manuelles Testen, ob ein Update verfügbar ist",
                    ru: "Проверка наличия обновления вручную.",
                    pt: "Testando manualmente se há uma atualização disponível.",
                    nl: "Handmatig controleren of er een update beschikbaar is",
                    fr: "Vérification manuelle de la disponibilité d'une mise à jour",
                    it: "Verifica manuale se è disponibile un aggiornamento",
                    es: "Comprobación manual de si hay una actualización disponible",
                    pl: "Ręczne testowanie dostępności aktualizacji",
                    uk: "Ручна перевірка наявності оновлення",
                    "zh-cn": "手动检查是否有可用更新",
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

    /**
     * @param {string} sn
     */
    async ensureRemoteButtons(sn) {
        await this.iobObject.extendObject(`${sn}.remote`, {
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
                icon: "img/mower.png",
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
            await this.iobObject.extendObject(`${sn}.remote.${id}`, {
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
    },
    /**
     * @param {string} sn
     */
    async ensureOwnRequestStates(sn) {
        await this.iobObject.extendObject(`${sn}.expert`, {
            type: "channel",
            common: {
                name: {
                    en: "Custom HTTP request",
                    de: "Benutzerdefinierte HTTP-Anfrage",
                    ru: "Пользовательский HTTP-запрос",
                    pt: "Requisição HTTP personalizada",
                    nl: "Aangepaste HTTP-aanvraag",
                    fr: "Requête HTTP personnalisée",
                    it: "Richiesta HTTP personalizzata",
                    es: "Solicitud HTTP personalizada",
                    pl: "Niestandardowe żądanie HTTP",
                    uk: "Користувацький HTTP-запит",
                    "zh-cn": "自定义 HTTP 请求",
                },
                icon: "img/expert.png",
            },
            native: {},
        });
        await this.iobObject.extendObject(`${sn}.expert.request`, {
            type: "state",
            common: {
                name: {
                    en: "Own HTTP request",
                    de: "Eigene HTTP-Anfrage",
                    ru: "Собственный HTTP-запрос",
                    pt: "Solicitação HTTP própria",
                    nl: "Eigen HTTP-verzoek",
                    fr: "Requête HTTP propre",
                    it: "Richiesta HTTP propria",
                    es: "Solicitud HTTP propia",
                    pl: "Własne żądanie HTTP",
                    uk: "Власний HTTP-запит",
                    "zh-cn": "自有 HTTP 请求",
                },
                type: "string",
                role: "json",
                read: true,
                write: true,
                def: JSON.stringify({ method: "get", url: "", headers: {}, data: null, auth: true }),
            },
            native: {},
        });
        await this.iobObject.extendObject(`${sn}.expert.response`, {
            type: "state",
            common: {
                name: {
                    en: "HTTP request response",
                    de: "HTTP-Anfrage-Antwort",
                    ru: "HTTP-запрос ответ",
                    pt: "Resposta da solicitação HTTP",
                    nl: "HTTP-verzoekreactie",
                    fr: "réponse à la requête HTTP",
                    it: "risposta alla richiesta HTTP",
                    es: "Solicitud HTTP y respuesta",
                    pl: "Odpowiedź na żądanie HTTP",
                    uk: "Відповідь на HTTP-запит",
                    "zh-cn": "HTTP 请求响应",
                },
                type: "string",
                role: "json",
                read: true,
                write: false,
                def: JSON.stringify({}),
            },
            native: {},
        });
    },
    /**
     * @param {string} sn
     */
    async ensureScheduleStates(sn) {
        await this.iobObject.extendObject(`${sn}.schedule`, {
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
                icon: "img/schedule.png",
            },
            native: {},
        });
        const meta = this.deviceMeta[sn];
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
            await this.iobObject.extendObject(`${sn}.schedule.${key}`, {
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
            if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
                await this.iobObject.extendObject(`${sn}.schedule.${key}_2`, {
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
        }
        await this.iobObject.extendObject(`${sn}.schedule.pause`, {
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
        await this.iobObject.extendObject(`${sn}.schedule.loadSchedule`, {
            type: "state",
            common: {
                name: {
                    en: "Reload mowing schedule",
                    de: "Mähplan neu laden",
                    ru: "Перезагрузить график кошения",
                    pt: "Recarregar cronograma de corte de grama",
                    nl: "Herlaad het maaischema",
                    fr: "Recharger le calendrier de tonte",
                    it: "Ricarica il programma di falciatura",
                    es: "Programa de recarga de siega",
                    pl: "Załaduj ponownie harmonogram koszenia",
                    uk: "Оновити графік скошування",
                    "zh-cn": "重新加载割草计划",
                },
                type: "boolean",
                role: "button",
                read: false,
                write: true,
                def: false,
            },
            native: {},
        });
        await this.iobObject.extendObject(`${sn}.schedule.set`, {
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
        if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
            await this.iobObject.extendObject(`${sn}.schedule.schedule_time_work_repeat`, {
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
            await this.iobObject.extendObject(`${sn}.schedule.schedule_mode`, {
                type: "state",
                common: {
                    name: {
                        en: "Schedule Mode",
                        de: "Zeitplanmodus",
                        ru: "Режим расписания",
                        pt: "Modo de agendamento",
                        nl: "Planningsmodus",
                        fr: "Mode de planification",
                        it: "Modalità di pianificazione",
                        es: "Modo de programación",
                        pl: "Tryb harmonogramu",
                        uk: "Режим розкладу",
                        "zh-cn": "计划模式",
                    },
                    type: "number",
                    role: "level",
                    write: true,
                    read: true,
                    def: 1,
                    states: {
                        0: "no schedule",
                        1: "recomended",
                        2: "custom",
                    },
                },
                native: {},
            });
            await this.iobObject.extendObject(`${sn}.schedule.schedule_time_zone`, {
                type: "state",
                common: {
                    name: {
                        en: "Time zone for schedule",
                        de: "Zeitzone für den Zeitplan",
                        ru: "Часовой пояс для расписания",
                        pt: "Fuso horário para a programação",
                        nl: "Tijdzone voor het schema",
                        fr: "Fuseau horaire pour l'horaire",
                        it: "Fuso orario per la programmazione",
                        es: "Zona horaria para el horario",
                        pl: "Strefa czasowa dla harmonogramu",
                        uk: "Часовий пояс для розкладу",
                        "zh-cn": "日程安排的时区",
                    },
                    type: "number",
                    role: "level",
                    write: true,
                    read: true,
                    def: 3600,
                },
                native: {},
            });
        }
    },
};
