"use strict";

const { EventEmitter } = require("node:events");

/**
 * Class Sunseeker
 */
class Sunseeker extends EventEmitter {
    /**
     * @param {string} username Sunseeker account email
     * @param {string} password Sunseeker account password
     * @param {ioBroker.Adapter} iob iobroker wrapper
     * @param {object} [options]
     * @param {string} [options.region] "EU" | "US"
     * @param {string} [options.apptype] "New" | "Old"
     * @param {string} [options.language] e.g. "de-DE"
     * @param {number} [options.interval] poll interval in seconds
     * @param {number} [options.refreshAfterMqttMs] debounce refresh after MQTT push
     */
    constructor(username, password, iob, options = {}) {
        super();
        this.username = String(username || "");
        this.password = String(password || "");
        this.iob = iob;
        this.options = {
            region: String(options.region || "EU").toUpperCase(),
            apptype: options.apptype || "New",
            language: options.language || "en-EN",
            interval: Number(options.interval) > 0 ? Number(options.interval) : 60,
            refreshAfterMqttMs: Number(options.refreshAfterMqttMs) > 0 ? Number(options.refreshAfterMqttMs) : 1500,
        };

        if (!this.iob) {
            throw new Error("Missing ioBroker function!!!");
        }

        this.session = null;
        this.devicesRaw = {};
        this.deviceMeta = {};
        this.mqttClient = null;
        this.mqttOldClient = null;
        this.mqttPassword = undefined;
        this.eventCodes = {};
        this.v1EventCodes = {};
        this.unloading = false;
        this.statusMqtt = false;
        this.firstStart = false;

        this._pollTimer = null;
        this._refreshTimer = null;
        this._mqttRetryTimer = null;
        this._mqttOldRetryTimer = null;
        this._pollFW = null;
        this.sleepTimer = null;
    }

    /**
     * Convenience: load event codes, login, fetch device list, init MQTT, start polling.
     * Caller can also invoke the steps individually.
     */
    async start() {
        this.loadEventCodes(this.options.language);
        await this.login();
        await this.getDevices();
        if (this.options.apptype === "New") {
            this.startMqttNew();
        } else {
            this.startMqttOld();
        }
        this.startPolling();
        this._scheduleTokenRefresh();
    }

    /**
     * Stop all pollings.
     */
    stop() {
        this.unloading = true;
        if (this._pollTimer) {
            this.iob.clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (this._refreshTimer) {
            this.iob.clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
        if (this._mqttRetryTimer) {
            this.iob.clearTimeout(this._mqttRetryTimer);
            this._mqttRetryTimer = null;
        }
        if (this.sleepTimer) {
            this.iob.clearTimeout(this.sleepTimer);
            this.sleepTimer = null;
        }
        if (this._mqttOldRetryTimer) {
            this.iob.clearTimeout(this._mqttOldRetryTimer);
            this._mqttOldRetryTimer = null;
        }
        if (this._pollFW) {
            this.iob.clearInterval(this._pollFW);
            this._pollFW = null;
        }
        for (const meta of Object.values(this.deviceMeta)) {
            if (meta._refreshTimer) {
                this.iob.clearTimeout(meta._refreshTimer);
                meta._refreshTimer = null;
            }
            meta.livePath = [];
            meta.robotPos = null;
            meta.chargerPos = null;
        }
        for (const client of [this.mqttClient, this.mqttOldClient]) {
            if (client) {
                try {
                    client.end(true);
                } catch (e) {
                    this.iob.log.debug(`mqtt end error: ${e.message}`);
                }
            }
        }
        this.mqttClient = null;
        this.mqttOldClient = null;
    }

    /**
     * @param {string} modelClass "S" | "X" | "V" | "V1"
     * @returns {Record<string,string>} event-code → label map for the device class
     */
    getEventCodes(modelClass) {
        return modelClass === "V1" || this.options.apptype === "Old" ? this.v1EventCodes : this.eventCodes;
    }
}

Object.assign(
    Sunseeker.prototype,
    require("./auth"),
    require("./devices"),
    require("./polling-and-settings"),
    require("./mqtt"),
    require("./map"),
    require("./helper"),
);

module.exports = Sunseeker;
