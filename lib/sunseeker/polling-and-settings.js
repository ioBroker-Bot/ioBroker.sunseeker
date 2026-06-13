"use strict";

const NEW_ACTIONS = {
    start: { cmd: "start", cmdid: "startWork" },
    pause: { cmd: "pause", cmdid: "pauseWork" },
    dock: { cmd: "start_find_charger", cmdid: "startFindCharger" },
    stop_find_charger: { cmd: "stop_find_charger", cmdid: "stopFindCharger" },
    border: { cmd: "follow_border", cmdid: "followBorder" },
    stop: { cmd: "stop", cmdid: "stopWork" },
    stop_task: { cmd: "stop_task", cmdid: "stopTask" },
    restart: { cmd: "restart", cmdid: "restartWork" },
};

const OLD_MODES = { start: 1, pause: 0, dock: 2, border: 4, stop: 4 };
const V1_MODES = { start: 1, pause: 0, dock: 2, border: 4, stop: 4 };

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

module.exports = {
    /**
     * Start the periodic poll loop. Replaces any previous timer.
     */
    startPolling() {
        this.stopPolling();
        const intervalMs = this.options.interval * 1000;
        this._pollTimer = this.iobTimer.setInterval(() => {
            this.updateAllDevices().catch(err => this.log.warn(`Polling: ${err.message}`));
        }, intervalMs);
        if (this.options.apptype !== "Old") {
            this.startUpdateCheck(true);
            this.startUpdateCheckInterval();
        }
    },

    stopPolling() {
        if (this._pollTimer) {
            this.iobTimer.clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    },

    startUpdateCheckInterval() {
        this._pollFW = this.iobTimer.setInterval(
            () => {
                this.startUpdateCheck(false);
            },
            60 * 60 * 1000 * 24,
        );
    },

    /**
     * @param {boolean} first
     */
    async startUpdateCheck(first) {
        if (first) {
            // Create the objects first
            await this.sleep(10000);
            this.sleepTimer = null;
        }
        const sns = Object.keys(this.devicesRaw);
        for (const sn of sns) {
            const meta = this.deviceMeta[sn];
            this.log.debug(meta.fw);
            let deviceSpecies = 3;
            const deviceType = 0;
            if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
                deviceSpecies = 0;
            }
            const data = {
                deviceSn: sn,
                deviceSpecies: deviceSpecies,
                deviceType: deviceType,
                version: meta.fw,
            };
            const res = await this.request(
                "POST",
                "/ota/firmware-large/wireless/check",
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify(data),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`startUpdateCheck: ${JSON.stringify(res.json)}`);
                let version = meta.fw;
                // ToDo added Base Firmware
                if (deviceType == 0) {
                    if (deviceSpecies == 3) {
                        if (
                            res.json.data &&
                            (typeof res.json.data.version == "string" || typeof res.json.data.version == "number")
                        ) {
                            version = res.json.data.version;
                        }
                    } else {
                        if (
                            res.json.data &&
                            (typeof res.json.data.wirelessVersion == "string" ||
                                typeof res.json.data.wirelessVersion == "number")
                        ) {
                            version = res.json.data.wirelessVersion;
                        }
                    }
                }
                let desc = "";
                if (res.json.data && typeof res.json.data.description == "string") {
                    desc = res.json.data.description;
                } else if (res.json.data && typeof res.json.data.currentVersionDesc == "string") {
                    desc = res.json.data.currentVersionDesc;
                }
                let update = false;
                if (this.compareVersions(version, meta.fw)) {
                    update = true;
                }
                meta.fw_new = version;
                if (typeof version == "number") {
                    version = version.toString();
                }
                this.emit("firmware", { sn: sn, fw: version, update: update, desc: desc });
            }
        }
    },

    /**
     * @param {string} v1
     * @param {string} v2
     * @returns {boolean}
     */
    compareVersions(v1, v2) {
        const a = v1.split(".").map(Number);
        const b = v2.split(".").map(Number);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const numA = a[i] || 0;
            const numB = b[i] || 0;
            if (numA > numB) {
                return true;
            }
            if (numA < numB) {
                return false;
            }
        }
        return false;
    },

    /**
     * @param {string} sn
     */
    async ota_upgrade(sn) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (this.compareVersions(meta.fw_new, meta.fw)) {
            const data = {
                appId: String(dev.appUserId || this.session.user_id),
                deviceSn: sn,
                deviceType: 0,
                id: "upgradeOTA",
                method: "upgrade",
                mode: "1",
            };
            const cmd = "otaUpgrade";
            const url = `${meta.cmdurl}${cmd}`;
            const res = await this.request(
                "POST",
                url,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify(data),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`ota_upgrade: ${JSON.stringify(res.json)}`);
                const meta = this.deviceMeta[sn];
                meta.fw = meta.fw_new;
                this.startUpdateCheck(false);
            }
        } else {
            this.log.warn(`No update found!`);
        }
    },

    /**
     * @param {string} sn
     */
    async ota_base_upgrade(sn) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (this.compareVersions(meta.fw_base_new, meta.fw_base)) {
            const data = {
                appId: String(dev.appUserId || this.session.user_id),
                deviceSn: sn,
                deviceType: 2,
                id: "baseStationOTA",
                method: "upgrade",
            };
            const cmd = "otaUpgrade";
            const url = `${meta.cmdurl}${cmd}`;
            const res = await this.request(
                "POST",
                url,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify(data),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`ota_base_upgrade: ${JSON.stringify(res.json)}`);
                const meta = this.deviceMeta[sn];
                meta.fw = meta.fw_new;
                this.startUpdateCheck(false);
            }
        } else {
            this.log.warn(`No update found!`);
        }
    },

    async updateAllDevices() {
        const sns = Object.keys(this.devicesRaw);
        this.log.debug(`updateAllDevices: ${sns.length} Device(s)`);
        for (const sn of sns) {
            try {
                await this.updateDevice(sn);
            } catch (err) {
                this.log.warn(`Update ${sn}: ${err.message}`);
            }
        }
    },

    /**
     * Fetch status + settings for one device. Emits a single 'status' event
     * with both payloads as separate fields. For New-API S/X devices this
     * also triggers a fetchMap (which emits its own 'map'/'livemap' events).
     *
     * @param {string} sn
     */
    async updateDevice(sn) {
        const dev = this.devicesRaw[sn];
        if (!dev) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        this.log.debug(`updateDevice ${sn}: Retrieve Status + Settings`);
        const statusPath =
            this.options.apptype === "Old"
                ? `/mower/device/getBysn?sn=${encodeURIComponent(sn)}`
                : `/app_wireless_mower/device/getBysn?sn=${encodeURIComponent(sn)}`;
        const settingsPath =
            this.options.apptype === "Old"
                ? `/mower/device-setting/${encodeURIComponent(sn)}`
                : `/app_wireless_mower/device-setting/${encodeURIComponent(sn)}`;

        const status = await this.request("GET", statusPath, this.authHeaders());
        const settings = await this.request("GET", settingsPath, this.authHeaders());

        const statusData = status.json && status.json.data ? status.json.data : null;
        const settingsData = settings.json && settings.json.data ? settings.json.data : null;
        this.log.debug(`statusData: ${JSON.stringify(statusData)}`);
        if (
            settingsData &&
            typeof settingsData.wirelessDeviceSchedules === "object" &&
            settingsData.wirelessDeviceSchedules !== null
        ) {
            delete settingsData.wirelessDeviceSchedules;
        }
        this.log.debug(`settingsData: ${JSON.stringify(settingsData)}`);
        this.emit("status", { sn, status: statusData, settings: settingsData });
        if (this.options.apptype === "New") {
            await this.getEvents(sn, 1, 10);
        }
        if (this.options.apptype !== "Old") {
            const meta = this.deviceMeta[sn];
            if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
                await this.fetchMap(sn).catch(err => this.log.debug(`Map ${sn}: ${err.message}`));
            }
        }
    },

    /**
     * @param {string} sn
     * @param {string} command
     * @param {any} value
     */
    async sendCommand(sn, command, value) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (this.options.apptype === "Old") {
            return this.sendCommandOld(dev, command);
        }
        if (meta.modelClass === "V1") {
            return this.sendCommandV1(dev, meta, command);
        }
        return this.sendCommandNew(dev, meta, command, value);
    },

    /**
     * @param {{ appUserId: string | number; deviceSn: string; }} dev
     * @param {{ modelClass: string; cmdurl: string; }} meta
     * @param {string} command
     * @param {any} value
     */
    async sendCommandNew(dev, meta, command, value) {
        const action = NEW_ACTIONS[command];
        if (!action) {
            this.log.error(`Command unknown: ${command}`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            cmd: action.cmd,
            deviceSn: dev.deviceSn,
            id: action.cmdid,
            method: "action",
        };
        if (command === "border" && meta.modelClass === "V") {
            data.value = true;
        }
        if (command === "start" && value && typeof value !== "boolean") {
            data.work_id = value;
        }
        const res = await this.request(
            "POST",
            `${meta.cmdurl}action`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`sendCommandNew: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {{ appUserId: string | number; deviceSn: string; }} dev
     * @param {{ modelClass: string; cmdurl: string; }} meta
     * @param {string} command
     */
    async sendCommandV1(dev, meta, command) {
        const mode = V1_MODES[command];
        if (mode === undefined) {
            this.log.error(`V1: Befehl ${command} nicht unterstützt`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            deviceSn: dev.deviceSn,
            method: "setWorkStatus",
            mode,
        };
        const res = await this.request(
            "POST",
            `${meta.cmdurl}setProperty`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`sendCommandV1: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {{ appUserId: string | number; deviceSn: string; }} dev
     * @param {string} command
     */
    async sendCommandOld(dev, command) {
        const mode = OLD_MODES[command];
        if (mode === undefined) {
            this.log.error(`Old: Befehl ${command} nicht unterstützt`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            deviceSn: dev.deviceSn,
            mode,
        };
        const res = await this.request(
            "POST",
            "/app_mower/device/setWorkStatus",
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`sendCommandOld: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     * @param {string} oldpin
     * @param {string} newpin
     */
    async changePin(sn, oldpin, newpin) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            cmd: "set_password",
            deviceSn: dev.deviceSn,
            id: "resetPassword",
            method: "action",
            new_pwd: newpin,
            old_pwd: oldpin,
        };
        const endpoint = "action";
        const res = await this.request(
            "POST",
            `${meta.cmdurl}${endpoint}`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`changePin: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     * @param {string | number | boolean | null} value
     * @param {string} id
     * @param {string} key
     */
    async setSettings(sn, value, id, key) {
        this.log.debug(`sn: ${sn} - value: ${value} - id: ${id} - key: ${key}`);
        if (value != null) {
            const dev = this.devicesRaw[sn];
            const meta = this.deviceMeta[sn];
            if (!dev || !meta) {
                this.log.error(`Device ${sn} unknown!`);
                return;
            }
            const data = {
                appId: String(dev.appUserId || this.session.user_id),
                deviceSn: dev.deviceSn,
                id: id,
                key: key,
                method: "set_property",
                value: value,
            };
            const endpoint = meta.modelClass === "V1" ? "setProperty" : "set_property";
            const res = await this.request(
                "POST",
                `${meta.cmdurl}${endpoint}`,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify(data),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`setSettings: ${JSON.stringify(res.json)}`);
            }
        }
    },

    /**
     * @param {string} sn
     * @param {number} gap
     * @param {number} speed
     */
    async setMowEfficiency(sn, gap, speed) {
        this.log.debug(`sn: ${sn} - gap: ${gap} - speed: ${speed}`);
        if (gap != null || speed != null) {
            const dev = this.devicesRaw[sn];
            const meta = this.deviceMeta[sn];
            if (!dev || !meta) {
                this.log.error(`Device ${sn} unknown!`);
                return;
            }
            const data = {
                appId: String(dev.appUserId || this.session.user_id),
                deviceSn: dev.deviceSn,
                id: "setMowEfficiency",
                key: "mow_efficiency",
                method: "set_property",
                speed: speed,
                gap: gap,
            };
            const endpoint = meta.modelClass === "V1" ? "setProperty" : "set_property";
            const res = await this.request(
                "POST",
                `${meta.cmdurl}${endpoint}`,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify(data),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`setMowEfficiency: ${JSON.stringify(res.json)}`);
            }
        }
    },

    /**
     * @param {string} sn
     * @param {"speed"|"height"} key
     * @param {number} value
     */
    async setBlade(sn, key, value) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (this.options.apptype === "Old") {
            this.log.error("Blade control is not supported for the legacy API.");
            return;
        }
        const intVal = Math.round(Number(value));
        if (!Number.isFinite(intVal)) {
            this.log.error(`Invalid value: ${value}`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            deviceSn: dev.deviceSn,
            id: "setDevBlade",
            key: "blade",
            method: "set_property",
            [key]: intVal,
        };
        const endpoint = meta.modelClass === "V1" ? "setProperty" : "set_property";
        const res = await this.request(
            "POST",
            `${meta.cmdurl}${endpoint}`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`setBlade: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     * @param {boolean} flag
     * @param {number} durationMin
     */
    async setRain(sn, flag, durationMin) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        const duration = Math.max(0, Math.min(720, Math.round(Number(durationMin))));
        const appId = String(dev.appUserId || this.session.user_id);

        if (this.options.apptype === "Old") {
            const res = await this.request(
                "POST",
                "/app_mower/device/setRain",
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify({
                    appId,
                    deviceSn: sn,
                    rainDelayDuration: duration,
                    rainFlag: flag,
                }),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`setRain old: ${JSON.stringify(res.json)}`);
            }
            return;
        }

        if (meta.modelClass === "V1") {
            const res = await this.request(
                "POST",
                `${meta.cmdurl}setProperty`,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify({
                    appId,
                    deviceSn: sn,
                    method: "setRain",
                    rainDelayDuration: duration,
                    rainFlag: flag,
                }),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`setRain V1: ${JSON.stringify(res.json)}`);
            }
            return;
        }

        const res = await this.request(
            "POST",
            `${meta.cmdurl}set_property`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify({
                appId,
                deviceSn: sn,
                id: "setDevRain",
                key: "rain",
                method: "set_property",
                rain_flag: flag,
                delay: duration,
            }),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`setRain: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} value e.g. "08:00-12:00", empty string means off
     * @returns {{startSec: number, endSec: number} | null}
     */
    parseScheduleDay(value) {
        const trimmed = String(value || "").trim();
        if (!trimmed) {
            return null;
        }
        const m = trimmed.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
        if (!m) {
            this.log.error(`Format "HH:MM-HH:MM" expected, data: "${trimmed}"`);
            return null;
        }
        const sh = Number(m[1]);
        const sm = Number(m[2]);
        const eh = Number(m[3]);
        const em = Number(m[4]);
        if (sh > 23 || eh > 23 || sm > 59 || em > 59) {
            this.log.error(`Invalid time: "${trimmed}"`);
            return null;
        }
        return { startSec: sh * 3600 + sm * 60, endSec: eh * 3600 + em * 60 };
    },

    /**
     * @param {number} sec
     * @returns {string}
     */
    secToHms(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    },

    /**
     * plan.monday..plan.sunday: "HH:MM-HH:MM" string (empty = day off)
     * plan.pause: boolean (default false) — pause whole schedule
     *
     * @param {string} sn
     * @param {Record<string, any>} plan
     * @param {Record<string, any>} plan2
     */
    async setSchedule(sn, plan, plan2) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.log.error(`Device ${sn} unknown!`);
            return;
        }
        const safePlan = plan && typeof plan === "object" ? plan : {};
        const parsed = DAYS.map((key, i) => ({
            dayIndex: i + 1,
            key,
            window: this.parseScheduleDay(safePlan[key]),
        }));

        const safePlan2 = plan2 && typeof plan2 === "object" ? plan2 : {};
        const parsed2 = DAYS.map((key, i) => ({
            dayIndex: i + 1,
            key,
            window: this.parseScheduleDay(safePlan2[key]),
        }));
        const pause = !!safePlan.pause;
        const appId = String(dev.appUserId || this.session.user_id);

        if (this.options.apptype === "Old") {
            const bos = parsed.map(p => ({
                dayOfWeek: p.dayIndex,
                startAt: p.window ? this.secToHms(p.window.startSec) : "00:00:00",
                endAt: p.window ? this.secToHms(p.window.endSec) : "00:00:00",
                trimFlag: !!p.window,
            }));
            const res = await this.request(
                "POST",
                "/app_mower/device-schedule/setScheduling",
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify({ appId, autoFlag: !pause, deviceScheduleBOS: bos, deviceSn: sn }),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`setSchedule old: ${JSON.stringify(res.json)}`);
            }
            return;
        }

        if (meta.modelClass === "V1") {
            const bos = [];
            for (const p of parsed) {
                if (!p.window) {
                    continue;
                }
                bos.push({
                    dayOfWeek: p.dayIndex,
                    startAt: this.secToHms(p.window.startSec),
                    endAt: this.secToHms(p.window.endSec),
                    trimFlag: true,
                });
            }
            const res = await this.request(
                "POST",
                `${meta.cmdurl}setProperty`,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify({
                    appId,
                    deviceSn: sn,
                    autoFlag: !pause,
                    method: "setSchedule",
                    deviceScheduleBOS: bos,
                    pause,
                }),
            );
            if (res.json && res.json.ok === false) {
                this.log.error(`API: ${res.json.msg}`);
            } else {
                this.log.debug(`setSchedule v1: ${JSON.stringify(res.json)}`);
            }
            return;
        }

        // S/X/V — set_property time_tactics. Mon=1..Sat=6, Sun=0
        const dayPeriod = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
        const time = [];
        for (const p of parsed) {
            if (!p.window) {
                continue;
            }
            time.push({
                unlock: true,
                period: [dayPeriod[p.key]],
                start: p.window.startSec,
                active: true,
                end: p.window.endSec,
                need_fllow_boader: false,
            });
        }
        for (const p of parsed2) {
            if (!p.window) {
                continue;
            }
            time.push({
                unlock: true,
                period: [dayPeriod[p.key]],
                start: p.window.startSec,
                active: true,
                end: p.window.endSec,
                need_fllow_boader: false,
            });
        }
        const allData = {
            appId,
            deviceSn: sn,
            id: "setTimeTactics",
            key: "time_tactics",
            method: "set_property",
            time,
            time_custom_flag: true,
            recommended_time_flag: false,
            time_zone: 3600,
            pause,
        };
        this.log.debug(`setSchedule: ${JSON.stringify(allData)}`);
        const res = await this.request(
            "POST",
            `${meta.cmdurl}set_property`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(allData),
        );
        if (res.json && res.json.ok === false) {
            this.log.error(`API: ${res.json.msg}`);
        } else {
            this.log.debug(`setSchedule: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {number} ms milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => {
            this.sleepTimer = this.iobTimer.setTimeout(() => {
                resolve(true);
            }, ms);
        });
    },
};

module.exports.NEW_ACTIONS = NEW_ACTIONS;
module.exports.OLD_MODES = OLD_MODES;
module.exports.V1_MODES = V1_MODES;
module.exports.DAYS = DAYS;
