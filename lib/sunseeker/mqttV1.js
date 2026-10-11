"use strict";

const mqtt = require("mqtt");

module.exports = {
    /** Dispatch by apptype: New (S/X/V/V1 brokers) vs. Old (legacy broker). */
    connectMqttV1() {
        if (!this.session?.access_token) {
            this.emit("error", new Error("connectMqttV1: No active session"));
            return;
        }
        if (!this.appId) {
            this.emit("error", new Error("connectMqttV1: No app id"));
            return;
        }
        if (this.mqttClientV1) {
            try {
                this.mqttClientV1.end(true);
            } catch {
                /* ignore */
            }
            this.mqttClientV1 = null;
        }
        const broker = this.mqttBroker(true);
        if (broker == null) {
            return;
        }
        const url = `mqtts://${broker.host}:${broker.port}`;
        const username = `${this.session.username || this.username}${this.appId}`;
        const userId = this.session.user_id;
        // App 1.7.0 clientId shape: APP_arod_<8 alnum>_<userId>
        const suffix = this.randomString(8);
        const clientId = `APP_arod_${suffix}_${userId}`;
        this.iob.log.info(`MQTT connection V1 ${url} username=${username} clientId=${clientId}`);
        const client = mqtt.connect(url, {
            clientId,
            username,
            password: this.mqttPassword,
            protocolVersion: 4,
            keepalive: 60,
            clean: true,
            reconnectPeriod: 0,
            connectTimeout: 15000,
            rejectUnauthorized: true,
        });
        this.mqttClientV1 = client;

        client.on("connect", () => {
            this.emit("mqtt_status", "mqtt_connected_V1", true);
            this.statusMqttV1 = true;
            this.iob.log.info("MQTT V1 connected");
            this.emit("mqttConnect");
            const userId = this.session.user_id;
            const topics = [`/wirelessdevice/${userId}/get`, `/wirelessmower/${userId}/get`];
            for (const t of topics) {
                client.subscribe(t, { qos: 0 }, (err, granted) => {
                    if (err) {
                        this.iob.log.error(`MQTT V1 subscribe ${t}: ${err.message}`);
                    } else {
                        this.iob.log.debug(`MQTT V1 subscribed: ${JSON.stringify(granted)}`);
                    }
                });
            }
            this.fetchInitialProperties().catch(err => this.iob.log.debug(`Initial-Properties V1: ${err.message}`));
        });

        client.on("message", (topic, payload) => this.onMqttMessage(topic, payload));

        client.on("error", err => {
            if (this.mqttClientV1 !== client) {
                return;
            }
            this.emit("mqtt_status", "mqtt_connected_V1", false);
            this.iob.log.warn(`MQTT V1 error: ${err.message}`);
            const code = /** @type {any} */ (err).code;
            if (code === 4 || code === 5 || /not authorized|bad user/i.test(err.message)) {
                // Broker rejected the credentials: drop the cached password and
                // flag so the retry re-runs the edit and provisions a fresh one.
                this.mqttPassword = undefined;
                this.mqttsPasswordFlagV1 = false;
                this.scheduleMqttRetryV1();
            }
            this.statusMqttV1 = false;
        });

        client.on("close", () => {
            this.emit("mqtt_status", "mqtt_connected_V1", false);
            if (this.mqttClientV1 !== client) {
                return;
            }
            this.iob.log.debug("MQTT V1 closed");
            this.emit("mqttDisconnect");
            if (!this.unloadingV1) {
                this.scheduleMqttRetryV1();
            }
            this.statusMqttV1 = false;
        });

        client.on("offline", () => {
            this.emit("mqtt_status", "mqtt_connected_V1", false);
            this.iob.log.debug("MQTT V1 offline");
            this.emit("mqttDisconnect");
            this.statusMqttV1 = false;
        });

        client.on("reconnect", () => {
            this.iob.log.debug("MQTT V1 reconnect");
            this.emit("mqttConnect");
            this.statusMqttV = true;
        });
    },

    scheduleMqttRetry() {
        if (this.unloadingV1 || this._mqttRetryTimerV1) {
            return;
        }
        this._mqttRetryTimerV1 = this.iob.setTimeout(() => {
            this._mqttRetryTimerV1 = null;
            this.startMqttNew(true).catch(err => this.iob.log.error(`MQTT V1-Reconnect: ${err.message}`));
        }, 30000);
    },
};
