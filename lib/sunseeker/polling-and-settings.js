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
    backup_delete_active: { cmd: "delete_backup_map", cmdid: "deleteBackupMap", amount: 1 },
    backup_delete: { cmd: "delete_backup_map", cmdid: "deleteBackupMap", amount: 2 },
    backup_map: { cmd: "backup_map", cmdid: "backupMap", amount: 3 },
    used: { cmd: "restore_map", cmdid: "restoreMap" },
    reset_small_bladeplate: { cmd: "maintain_consumable_item", cmdid: "maintainConsumableItem" },
    reset_small_blade: { cmd: "maintain_consumable_item", cmdid: "maintainConsumableItem" },
    reset_bladeplate: { cmd: "maintain_consumable_item", cmdid: "maintainConsumableItem" },
    reset_blade: { cmd: "maintain_consumable_item", cmdid: "maintainConsumableItem" },
    merge_zones: { cmd: "merge_region", cmdid: "mergeRegion" },
    split_zones: { cmd: "split_region", cmdid: "splitRegion" },
};

const OLD_MODES = { start: 1, pause: 0, dock: 2, border: 4, stop: 4 };
const V1_MODES = { start: 1, pause: 0, dock: 2, border: 4, stop: 4 };
const V1_ACTION = {
    start: { method: "setWorkStatus", val: "start" },
    pause: { method: "setWorkStatus", val: "pause" },
    dock: { method: "setWorkStatus", val: "dock" },
    border: { method: "setWorkStatus", val: "border" },
    stop: { method: "setWorkStatus", val: "stop" },
    set_return_path: { method: "setReturnMode", val: "returnMode" },
    set_screen_durration: { method: "setDuration", val: "duration" },
    set_border_first: { method: "setRideMode", val: "rideMode" },
    set_border_distance: { method: "setLv", val: "lv" },
    set_workmode: { method: "setWorkStatus", val: "mode" },
    set_schedule_on_off: { method: "setPause", val: "Pause" },
};

const DAYS = ["1_monday", "2_tuesday", "3_wednesday", "4_thursday", "5_friday", "6_saturday", "0_sunday"];

module.exports = {
    /**
     * Start the periodic poll loop. Replaces any previous timer.
     */
    startPolling() {
        this.stopPolling();
        const intervalMs = this.options.interval * 1000;
        this._pollTimer = this.iob.setInterval(() => {
            this.updateAllDevices().catch(err => this.iob.log.warn(`Polling: ${err.message}`));
        }, intervalMs);
        if (this.options.apptype !== "Old") {
            this.startUpdateCheck(true);
            this.startUpdateCheckInterval();
        }
    },

    stopPolling() {
        if (this._pollTimer) {
            this.iob.clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    },

    startUpdateCheckInterval() {
        this._pollFW = this.iob.setInterval(
            () => {
                this.errorCounter = 0;
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
            this.iob.log.debug(meta.fw);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`startUpdateCheck: ${JSON.stringify(res.json)}`);
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
            this.iob.log.error(`Device ${sn} unknown!`);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`ota_upgrade: ${JSON.stringify(res.json)}`);
                const meta = this.deviceMeta[sn];
                meta.fw = meta.fw_new;
                this.startUpdateCheck(false);
            }
        } else {
            this.iob.log.warn(`No update found!`);
        }
    },

    /**
     * @param {string} sn
     */
    async ota_base_upgrade(sn) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.iob.log.error(`Device ${sn} unknown!`);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`ota_base_upgrade: ${JSON.stringify(res.json)}`);
                const meta = this.deviceMeta[sn];
                meta.fw = meta.fw_new;
                this.startUpdateCheck(false);
            }
        } else {
            this.iob.log.warn(`No update found!`);
        }
    },

    async updateAllDevices() {
        const sns = Object.keys(this.devicesRaw);
        this.iob.log.debug(`updateAllDevices: ${sns.length} Device(s)`);
        for (const sn of sns) {
            try {
                await this.updateDevice(sn);
                await this.getNotice(sn);
                if (this.statusMqtt && this.firstStart) {
                    this.fetchAllProperties(sn).catch(err => this.iob.log.debug(`Initial-Properties: ${err.message}`));
                }
            } catch (err) {
                this.iob.log.warn(`Update ${sn}: ${err.message}`);
            }
        }
        this.firstStart = true;
    },

    /**
     * @param {string} sn
     * @param {any} data
     */
    async setNotice(sn, data) {
        this.iob.log.debug(`setNotice: ${sn} - ${JSON.stringify(data)}`);
        const res = await this.request(
            "POST",
            "/app_mower/notice-control",
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API-setNotice: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setNotice: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     */
    async getNotice(sn) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        this.iob.log.debug(`notice ${sn}: Retrieve Notice-Control`);
        const notice = await this.request("GET", "/app_mower/notice-control", this.authHeaders());
        if (notice == "Timeout") {
            return;
        }
        this.iob.log.debug(`notice: ${JSON.stringify(notice)}`);
        if (notice && notice.json && notice.json.data) {
            this.emit("notice", { sn, notice: notice.json.data });
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
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        this.iob.log.debug(`updateDevice ${sn}: Retrieve Status + Settings`);
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

        if (statusData == "Timeout") {
            return;
        }
        if (settingsData == "Timeout") {
            return;
        }
        this.iob.log.debug(`statusData: ${JSON.stringify(statusData)}`);
        if (
            settingsData &&
            typeof settingsData.wirelessDeviceSchedules === "object" &&
            settingsData.wirelessDeviceSchedules !== null
        ) {
            delete settingsData.wirelessDeviceSchedules;
        }
        this.iob.log.debug(`settingsData: ${JSON.stringify(settingsData)}`);
        this.emit("status", { sn, status: statusData, settings: settingsData });
        if (this.options.apptype === "New") {
            await this.getEvents(sn, 1, 10);
        }
        if (this.options.apptype !== "Old") {
            if (meta && (meta.modelClass === "S" || meta.modelClass === "X")) {
                await this.fetchMap(sn).catch(err => this.iob.log.debug(`Map ${sn}: ${err.message}`));
            }
        }
    },

    /**
     * @param {string} sn
     */
    async setMarkAllAsRead(sn) {
        const dev = this.devicesRaw[sn];
        if (!dev) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        const data = { userId: String(dev.appUserId || this.session.user_id), sn: sn, type: 2 };
        const res = await this.request(
            "PUT",
            `/app_wireless_mower/message-send-logs/batchread`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API unread: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setMarkAllAsRead: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     */
    async getScheduleX(sn) {
        const dev = this.devicesRaw[sn];
        if (!dev) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        const apiPath = `/app_wireless_mower/device-setting/getTime/${sn}`;
        const res = await this.request("GET", apiPath, { ...this.authHeaders(), "Content-Type": "application/json" });
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API unread: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setMarkAllAsRead: ${JSON.stringify(res.json)}`);
            //ToDo Emit
        }
    },

    /**
     * @param {string} sn
     */
    async getInfo(sn) {
        const dev = this.devicesRaw[sn];
        if (!dev) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        const apiPath = `/app_wireless_mower/device/info/${dev.deviceId}`;
        const res = await this.request("GET", `${apiPath}`, {
            "Content-Type": "application/json",
            ...this.authHeaders(),
        });
        if (res == "Timeout") {
            return;
        }
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API-getInfo: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`getInfo: ${JSON.stringify(res.json)}`);
            this.emit("zigzag", { sn: sn, data: res.json.data, first: true });
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
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (this.options.apptype === "Old") {
            return this.sendCommandOld(dev, command);
        }
        if (meta.modelClass === "V1") {
            return this.sendCommandV1(dev, meta, command, value);
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
            this.iob.log.error(`Command unknown: ${command}`);
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
        if (
            command === "backup_delete" ||
            command === "useThisMap" ||
            command === "backup_delete_active" ||
            command === "backup_map"
        ) {
            data.map_id = value;
        }
        if (command === "reset_small_bladeplate") {
            data.consumable_items = ["small_cutter"];
        }
        if (command === "reset_small_blade") {
            data.consumable_items = ["small_blade"];
        }
        if (command === "reset_bladeplate") {
            data.consumable_items = ["cutter"];
        }
        if (command === "reset_blade") {
            data.consumable_items = ["blade"];
        }
        if (command === "merge_zones") {
            data.region_id = value;
        }
        if (command === "split_zones") {
            data.points = value.points;
            data.region_id = value.region;
        }
        const res = await this.request(
            "POST",
            `${meta.cmdurl}action`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`sendCommandNew: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {{ appUserId: string | number; deviceSn: string; }} dev
     * @param {{ modelClass: string; cmdurl: string; }} meta
     * @param {string} command
     * @param {boolean | number} value
     */
    async sendCommandV1(dev, meta, command, value) {
        const mode = V1_MODES[command];
        const action = V1_ACTION[command];
        if (mode === undefined && action === undefined) {
            this.iob.log.error(`V1: Command ${command} is not supported.`);
            return;
        }
        let data = {
            appId: String(dev.appUserId || this.session.user_id),
            deviceSn: dev.deviceSn,
            method: action.method,
        };
        if (mode !== undefined) {
            data[action.val] = mode[command];
        } else if (action !== undefined) {
            data[action.val] = value;
        }
        const res = await this.request(
            "POST",
            `${meta.cmdurl}setProperty`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`sendCommandV1: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {{ appUserId: string | number; deviceSn: string; }} dev
     * @param {string} command
     */
    async sendCommandOld(dev, command) {
        const mode = OLD_MODES[command];
        if (mode === undefined) {
            this.iob.log.error(`Old: Befehl ${command} nicht unterstützt`);
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
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`sendCommandOld: ${JSON.stringify(res.json)}`);
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
            this.iob.log.error(`Device ${sn} unknown!`);
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
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`changePin: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     * @param {number} mode
     * @param {number} angle
     */
    async setPlanMode(sn, mode, angle) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            deviceSn: dev.deviceSn,
            id: "setPlanAngle",
            key: "plan_angle",
            method: "set_property",
            plan_mode: mode,
            plan_value: angle,
        };
        const endpoint = meta.modelClass === "V1" ? "setProperty" : "set_property";
        const res = await this.request(
            "POST",
            `${meta.cmdurl}${endpoint}`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setSettings: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     * @param {ioBroker.State | null | undefined} val
     */
    async setAutoUpgrade(sn, val) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (!val || val.val == null) {
            this.iob.log.error(`Value is empty`);
            return;
        }
        const data = {
            appId: String(dev.appUserId || this.session.user_id),
            deviceSn: dev.deviceSn,
            id: "setAutoUpgrade",
            key: "auto_upgrade",
            method: "set_property",
            value: val.val,
            time_zone: meta.time_zone,
            time: [{ start: 7200, end: 21600 }],
        };
        const endpoint = meta.modelClass === "V1" ? "setProperty" : "set_property";
        this.iob.log.debug(`path ${meta.cmdurl}${endpoint} - ${JSON.stringify(data)}`);
        const res = await this.request(
            "POST",
            `${meta.cmdurl}${endpoint}`,
            { ...this.authHeaders() },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setAutoUpgrade: ${JSON.stringify(res.json)}`);
        }
    },
    /**
     * @param {string} sn
     * @param {ioBroker.State | null | undefined} val
     */
    async setDeviceName(sn, val) {
        const dev = this.devicesRaw[sn];
        const meta = this.deviceMeta[sn];
        if (!dev || !meta) {
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (!val || !val.val || val.val == "") {
            this.iob.log.error(`Device name is empty`);
            return;
        }
        let data = {};
        let method = "PUT";
        let path = "/app_wireless_mower/device/appEditDevice";
        if (this.options.apptype === "Old") {
            data = {
                deviceSn: dev.deviceSn,
                appId: String(dev.appUserId || this.session.user_id),
                rename: val.val,
            };
            method = "POST";
            path = "/app_mower/device/setNickName";
        } else {
            data = {
                sn: dev.deviceSn,
                deviceName: val.val,
            };
        }
        this.iob.log.debug(`setChangeName: ${method} - ${path} ${JSON.stringify(data)}`);
        const res = await this.request(
            method,
            path,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(data),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setDeviceSettings: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {string} sn
     * @param {string | number | boolean | null} value
     * @param {string} id
     * @param {string} key
     * @param {any} addValue
     */
    async setSettings(sn, value, id, key, addValue) {
        this.iob.log.debug(`sn: ${sn} - value: ${value} - id: ${id} - key: ${key}`);
        if (value != null) {
            const dev = this.devicesRaw[sn];
            const meta = this.deviceMeta[sn];
            if (!dev || !meta) {
                this.iob.log.error(`Device ${sn} unknown!`);
                return;
            }
            const data = {
                appId: String(dev.appUserId || this.session.user_id),
                deviceSn: dev.deviceSn,
                id: id,
                key: key,
                method: "set_property",
                value: value,
                ...addValue,
            };
            const endpoint = meta.modelClass === "V1" ? "setProperty" : "set_property";
            this.iob.log.debug(`path ${meta.cmdurl}${endpoint} - ${JSON.stringify(data)}`);
            const res = await this.request(
                "POST",
                `${meta.cmdurl}${endpoint}`,
                { ...this.authHeaders(), "Content-Type": "application/json" },
                JSON.stringify(data),
            );
            if (res.json && res.json.ok === false) {
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`setSettings: ${JSON.stringify(res.json)}`);
            }
        }
    },

    /**
     * @param {string} sn
     * @param {number} gap
     * @param {number} speed
     */
    async setMowEfficiency(sn, gap, speed) {
        this.iob.log.debug(`sn: ${sn} - gap: ${gap} - speed: ${speed}`);
        if (gap != null || speed != null) {
            const dev = this.devicesRaw[sn];
            const meta = this.deviceMeta[sn];
            if (!dev || !meta) {
                this.iob.log.error(`Device ${sn} unknown!`);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`setMowEfficiency: ${JSON.stringify(res.json)}`);
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
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        if (this.options.apptype === "Old") {
            this.iob.log.error("Blade control is not supported for the legacy API.");
            return;
        }
        const intVal = Math.round(Number(value));
        if (!Number.isFinite(intVal)) {
            this.iob.log.error(`Invalid value: ${value}`);
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
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setBlade: ${JSON.stringify(res.json)}`);
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
            this.iob.log.error(`Device ${sn} unknown!`);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`setRain old: ${JSON.stringify(res.json)}`);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`setRain V1: ${JSON.stringify(res.json)}`);
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
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setRain: ${JSON.stringify(res.json)}`);
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
            this.iob.log.error(`Format "HH:MM-HH:MM" expected, data: "${trimmed}"`);
            return null;
        }
        const sh = Number(m[1]);
        const sm = Number(m[2]);
        const eh = Number(m[3]);
        const em = Number(m[4]);
        if (sh > 23 || eh > 23 || sm > 59 || em > 59) {
            this.iob.log.error(`Invalid time: "${trimmed}"`);
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
            this.iob.log.error(`Device ${sn} unknown!`);
            return;
        }
        const safePlan = plan && typeof plan === "object" ? plan : {};
        const parsed = DAYS.map((key, i) => ({
            dayIndex: i + 1,
            key,
            window: this.parseScheduleDay(safePlan[key].time),
            unlock: safePlan[key].unlock,
            zone: safePlan[key].zone,
            active: safePlan[key].active,
            order: safePlan[key].order,
            border: safePlan[key].border,
        }));
        const safePlan2 = plan2 && typeof plan2 === "object" ? plan2 : {};
        const parsed2 = DAYS.map((key, i) => ({
            dayIndex: i + 1,
            key,
            window: this.parseScheduleDay(safePlan2[key].time),
            unlock: safePlan[key].unlock,
            zone: safePlan[key].zone,
            active: safePlan[key].active,
            order: safePlan[key].order,
            border: safePlan[key].border,
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`setSchedule old: ${JSON.stringify(res.json)}`);
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
                this.iob.log.error(`API: ${res.json.msg}`);
            } else {
                this.iob.log.debug(`setSchedule v1: ${JSON.stringify(res.json)}`);
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
                unlock: p.unlock,
                period: [dayPeriod[p.key]],
                start: p.window.startSec,
                active: p.active,
                end: p.window.endSec,
                need_fllow_boader: p.border,
                order: p.order,
                region_id: p.zone,
            });
        }
        for (const p of parsed2) {
            if (!p.window) {
                continue;
            }
            time.push({
                unlock: p.unlock,
                period: [dayPeriod[p.key]],
                start: p.window.startSec,
                active: p.active,
                end: p.window.endSec,
                need_fllow_boader: p.border,
                order: p.order,
                region_id: p.zone,
            });
        }
        const allData = {
            appId,
            deviceSn: sn,
            id: "setTimeTactics",
            key: "time_tactics",
            method: "set_property",
            time,
            time_custom_flag: meta.time_custom_flag,
            recommended_time_flag: meta.recommended_time_flag,
            time_zone: meta.time_zone,
            pause,
        };
        this.iob.log.debug(`setSchedule: ${JSON.stringify(allData)}`);
        const res = await this.request(
            "POST",
            `${meta.cmdurl}set_property`,
            { ...this.authHeaders(), "Content-Type": "application/json" },
            JSON.stringify(allData),
        );
        if (res.json && res.json.ok === false) {
            this.iob.log.error(`API: ${res.json.msg}`);
        } else {
            this.iob.log.debug(`setSchedule: ${JSON.stringify(res.json)}`);
        }
    },

    /**
     * @param {number} ms milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => {
            this.sleepTimer = this.iob.setTimeout(() => {
                resolve(true);
            }, ms);
        });
    },
};

module.exports.NEW_ACTIONS = NEW_ACTIONS;
module.exports.OLD_MODES = OLD_MODES;
module.exports.V1_MODES = V1_MODES;
module.exports.V1_ACTION = V1_ACTION;
module.exports.DAYS = DAYS;
