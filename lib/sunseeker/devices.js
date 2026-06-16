"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CMDURL_SXV = "/iot_mower/wireless/device/";
const CMDURL_V1 = "/app_wirelessv1_mower/wirelessv1/device/";

module.exports = {
    /**
     * Read the bundled event-code JSON for the configured language.
     *
     * @param {string} language
     */
    loadEventCodes(language) {
        const lang = String(language || "de")
            .toLowerCase()
            .slice(0, 2);
        try {
            const file = path.join(__dirname, "eventcodes.json");
            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            const fallback = "en";
            this.eventCodes = data.events[lang] || data.events[fallback] || {};
            this.v1EventCodes = data.v1Events[lang] || data.v1Events[fallback] || {};
        } catch (err) {
            this.iob.log.debug(`Event codes cannot be loaded: ${err.message}`);
            this.eventCodes = {};
            this.v1EventCodes = {};
        }
    },

    /**
     * @param {string} modelName e.g. "S2", "X3", "V18", "V1Pro"
     * @returns {"S"|"X"|"V"|"V1"}
     */
    classifyModel(modelName) {
        if (!modelName) {
            return "S";
        }
        if (/^V18/.test(modelName) || /^V3/.test(modelName)) {
            return "V";
        }
        if (/^V1/.test(modelName)) {
            return "V1";
        }
        if (/^V/.test(modelName)) {
            return "V";
        }
        if (/^X/.test(modelName)) {
            return "X";
        }
        return "S";
    },

    /**
     * @param {string} modelName e.g. "S2", "X3", "V18", "V1Pro"
     * @returns {"Gen0"|"Gen1"|"Gen2"|"Gen3"}
     */
    classifyGeneration(modelName) {
        if (["X3", "X4", "X5", "X7", "X9", "S3", "S4", "S5"].includes(modelName)) {
            return "Gen1";
        } else if (["X3 Gen2", "X5 Gen2", "X7 Gen2", "S5 Gen2"].includes(modelName)) {
            return "Gen2";
        } else if (["X5 Gen3", "X7 Gen3", "X7 Plus Gen3"].includes(modelName)) {
            return "Gen2";
        }
        return "Gen0";
    },

    /**
     * Pick MQTT broker based on the FIRST device's model class. Mixed accounts
     * (V1 + S/X) connect through the wrong broker for the minority — pre-existing
     * limitation, not fixed in this refactor.
     */
    mqttBroker() {
        const first = Object.values(this.deviceMeta)[0];
        const v1 = first && first.modelClass === "V1";
        if (this.options.region === "US") {
            return v1
                ? { host: "app.mqttv1-us.sk-robot.com", port: 32884 }
                : { host: "wfsmqtt-specific-us.sk-robot.com", port: 1884 };
        }
        return v1
            ? { host: "app.mqttv1-eu.sk-robot.com", port: 32884 }
            : { host: "wfsmqtt-specific.sk-robot.com", port: 1884 };
    },

    /**
     * Initialization Meta
     *
     * @param {any} d
     * @returns {any}
     */
    _initDeviceMeta(d) {
        const modelClass = this.classifyModel(d.modelName);
        const gen = this.classifyGeneration(d.modelName);
        return {
            modelClass,
            gen,
            cmdurl: modelClass === "V1" ? CMDURL_V1 : CMDURL_SXV,
            robotPos: null,
            chargerPos: null,
            livePath: [],
            _refreshTimer: null,
            _mapInFlight: false,
            _mapMqttInFlight: false,
            mapJson: null,
            pathJson: null,
            mapid: undefined,
            fw: d.firmwareVersion,
            fw_new: "",
            fw_base: "",
            fw_base_new: "",
            livemap: false,
            time_custom_flag: true,
            recommended_time_flag: false,
            time_zone: 3600,
        };
    },

    /**
     * @param {string} sn
     * @param {any} data
     */
    setScheduleInfo(sn, data) {
        const meta = this.deviceMeta[sn];
        let custom = false;
        let recommended = false;
        let set = 0;
        if (data && typeof data.time_custom_flag === "boolean") {
            meta.time_custom_flag = data.time_custom_flag;
            custom = data.time_custom_flag;
        }
        if (data && typeof data.recommended_time_flag === "boolean") {
            meta.recommended_time_flag = data.recommended_time_flag;
            recommended = data.recommended_time_flag;
        }
        if (data && typeof data.time_zone === "number") {
            meta.time_zone = data.time_zone;
        }
        if (recommended && custom) {
            set = 2;
        } else if (!recommended && custom) {
            set = 1;
        }
        this.emit("mode", { sn: sn, mode: set });
    },

    /**
     * @param {string} sn
     * @param {number} mode
     */
    setScheduleMode(sn, mode) {
        const meta = this.deviceMeta[sn];
        if (mode == 0) {
            meta.time_custom_flag = false;
            meta.recommended_time_flag = true;
        } else if (mode == 1) {
            meta.time_custom_flag = true;
            meta.recommended_time_flag = false;
        } else if (mode == 2) {
            meta.time_custom_flag = true;
            meta.recommended_time_flag = true;
        }
    },

    /**
     * Fetch device event list.
     *
     * @param {string} sn
     * @param {number} current
     * @param {number} size
     */
    async getEvents(sn, current, size) {
        const apiPath = `/app_wireless_mower/work_record/page?sn=${sn}&current=${current}&size=${size}`;
        const { json } = await this.request("GET", apiPath, {
            "Content-Type": "application/json",
            ...this.authHeaders(),
        });
        if (json && json.data && json.data.records && Array.isArray(json.data.records)) {
            this.iob.log.debug(`Device work records: ${JSON.stringify(json.data.records)}`);
            if (this.eventCodes) {
                for (const r of json.data.records) {
                    if (r.startReason != null) {
                        r.startReason = this.eventCodes[r.startReason];
                    }
                    if (r.endReason != null) {
                        r.endReason = this.eventCodes[r.endReason];
                    }
                }
                this.emit("records", { sn, records: json.data.records });
            }
        } else {
            try {
                this.iob.log.debug(`Device record list is empty: ${JSON.stringify(json.data)}`);
            } catch {
                this.iob.log.warn(`Device record list is empty!!`);
            }
        }
    },

    /**
     * Fetch the account device list. Populates this.devicesRaw and
     * this.deviceMeta, then emits a 'devices' event with the raw array.
     */
    async getDevices() {
        const apiPath =
            this.options.apptype === "Old"
                ? "/mower/device-user/list"
                : "/app_wireless_mower/device-user/getCustomDevice?all=true";
        this.iob.log.debug(`getDevices: ${apiPath}`);
        const { json } = await this.request("GET", apiPath, {
            "Content-Type": "application/json",
            ...this.authHeaders(),
        });
        if (!Array.isArray(json.data)) {
            this.iob.log.warn(`Device list empty: ${JSON.stringify(json)}`);
            this.emit("devices", { devices: [] });
            return [];
        }
        this.iob.log.debug(`getDevices: Found ${json.data.length} device(s)`);
        this.iob.log.debug(`getDevices data: ${JSON.stringify(json.data)}`);
        for (const d of json.data) {
            const sn = d.deviceSn;
            this.devicesRaw[sn] = d;
            this.deviceMeta[sn] = this._initDeviceMeta(d);
            this.iob.log.info(`Device: sn=${sn} model=${d.modelName} name=${d.deviceName}`);
            if (this.options.apptype === "New") {
                await this.getEvents(sn, 1, 10);
            }
        }
        this.emit("devices", { devices: json.data });
        return json.data;
    },
};

module.exports.CMDURL_SXV = CMDURL_SXV;
module.exports.CMDURL_V1 = CMDURL_V1;
