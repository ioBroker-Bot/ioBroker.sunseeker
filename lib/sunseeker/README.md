# sunseeker-client

Pure Node.js client for the Sunseeker robotic-mower cloud. Wraps the official REST endpoints and the MQTT push channel for `S`, `X`, `V`, `V1` and the legacy ("Old") product line.

No ioBroker / Home Assistant / framework dependency. Drop the folder into any Node project (or `npm install ./lib/sunseeker`) and use directly.

## Install

```bash
npm install axios mqtt
# Optional, only needed for renderLivemap():
npm install pureimage
```

## Usage

```js
const Sunseeker = require("./lib/sunseeker");

const client = new Sunseeker("user@example.com", "secret", {
    region: "EU", // EU | US
    apptype: "New", // New (S/X/V/V1) | Old (legacy)
    language: "de-DE",
    interval: 60, // poll seconds
    refreshAfterMqttMs: 1500, // livemap update after MQTT message -> id === "device_pos" || id === "getPathData"
    logger: console,
});

client.on("devices", ({ devices }) => console.log("devices:", devices.length));
client.on("status", ({ sn, status, settings }) => {
    /* … */
});
client.on("mqtt", ({ sn, topic, data }) => {
    /* … */
});
client.on("map", ({ sn, kind, payload }) => {
    /* kinds: info, image, wifi, net, texture, mapData, pathData, backup */
});
client.on("livemap", ({ sn, dataUrl }) => {
    /* PNG data URL */
});
client.on("mqttConnect", () => {});
client.on("mqttDisconnect", () => {});
client.on("error", (text, err) => console.error(`${text}: ${err}`));
client.on("devicesList", ({ devices }) => console.log("devices:", devices.length));
client.on("updateDevices", ({ devices }) => console.log("devices:", devices.length));
client.on("zigzag", ({ sn, data, path }) => {
    /* … */
});
client.on("customZigzag", ({ sn, data }) => {
    /* … */
});
client.on("notice", ({ sn, notice }) => {
    /* … */
});
client.on("firmware", ({ sn, fw, update, desc }) => {
    /* … */
});
client.on("warn", (text, err) => console.warn(`${text}: ${err}`));
client.on("own", ({ sn, data }) => {
    /* … */
});
client.on("mqtt_auth", ({ pw, key }) => {
    /* … */
});
client.on("mqtt_status", (objectId, val) => {
    /* … */
});
client.on("session", session => {
    /* … */
});
client.on("mode", ({ sn, mode }) => {
    /* … */
});
client.on("fence", ({ sn, fence }) => {
    /* … */
});
client.on("theft", ({ sn, theft }) => {
    /* … */
});
client.on("position", ({ sn, pos }) => {
    /* … */
});
client.on("previewmap", ({ sn, dataUrl, region }) => {
    /* … */
});
client.on("sharing", (sn, data) => {
    /* … */
});
client.on("mqttInvite", (sn, data) => {
    /* … */
});
client.on("event", ({ sn, data }) => {
    /* … */
});
client.on("notify", ({ sn, data }) => {
    /* … */
});
client.on("countUnreadMessage", ({ sn, data }) => {
    /* … */
});
client.on("systemMessage", ({ sn, data }) => {
    /* … */
});
client.on("skin", ({ sn, data }) => {
    /* … */
});
client.on("limit", ({ sn, limit }) => {
    /* … */
});
client.on("communities", ({ sn, communities }) => {
    /* … */
});
client.on("agreements", ({ sn, data }) => {
    /* … */
});
client.on("settingsX", ({ sn, data }) => {
    /* … */
});
client.on("getTime", ({ sn, data }) => {
    /* … */
});
client.on("appRelease", ({ sn, data }) => {
    /* … */
});
client.on("errorMessage", ({ sn, data }) => {
    /* … */
});

await client.start(); // login + getDevices + initMqtt + startPolling
// …or call client.login(), client.getDevices(), client.startMqttNew(), client.startPolling() yourself.

await client.sendCommand(sn, "start");
await client.setBlade(sn, "speed", 2900);
await client.setRain(sn, true, 60);
await client.setSchedule(sn, { monday: "08:00-12:00", pause: false /* … */ });
await client.getAgreements(sn); // Promise boolean -> Value over event -> agreements
await client.checkAppUpdate("android", "1.1.28.3103"); // type: "android or iphone)" Promise boolean -> Value over event -> appRelease
await client.getSettingsX(sn); // Promise boolean -> Value over event -> settingsX
await client.getScheduleX(sn); // Promise boolean -> Value over event -> getTime
await client.getErrorMessage(sn, type, detail, model, base); // Promise boolean -> Value over event -> errorMessage

client.stop(); // clears all timers + closes MQTT
```

## API surface

- Lifecycle: `start()`, `stop()`
- Auth: `login()`, `refreshToken()`, `request(method, path, headers, data)`
- Devices: `getDevices()`, `classifyModel(modelName)`, `getEventCodes(modelClass)`
- Polling/Settings: `startPolling()`, `stopPolling()`, `updateAllDevices()`, `updateDevice(sn)`, `sendCommand(sn, cmd, value?)`, `setBlade(sn, key, value)`, `setRain(sn, flag, durationMin)`, `setSchedule(sn, plan)`
- MQTT: `startMqttNew()`, `startMqttOld()`, `getDeviceProperty(sn, body)`, `fetchInitialProperties()`
- Map: `fetchMap(sn)`, `renderLivemap(mapData, pathData, meta)`

## Events

| Event                | Payload                    | Notes                                         |
| -------------------- | -------------------------- | --------------------------------------------- |
| `devices`            | `{ devices: object[] }`    | After successful `getDevices()`.              |
| `status`             | `{ sn, status, settings }` | `settings` may be missing on partial fetches. |
| `mqtt`               | `{ sn, topic, data }`      | Parsed JSON of the MQTT message.              |
| `map`                | `{ sn, kind, payload }`    | See kinds above.                              |
| `livemap`            | `{ sn, dataUrl }`          | Rendered PNG, requires optional `pureimage`.  |
| `mqttConnect`        | —                          | After broker handshake.                       |
| `mqttDisconnect`     | —                          | On socket close.                              |
| `error`              | `Error`                    | Background errors. Register a listener.       |
| `devicesList`        |                            |                                               |
| `updateDevices`      |                            |                                               |
| `zigzag`             |                            |                                               |
| `customZigzag`       |                            |                                               |
| `notice`             |                            |                                               |
| `firmware`           |                            |                                               |
| `warn`               |                            |                                               |
| `own`                |                            |                                               |
| `mqtt_auth`          |                            |                                               |
| `mqtt_status`        |                            |                                               |
| `session`            |                            |                                               |
| `mode`               |                            |                                               |
| `fence`              |                            |                                               |
| `theft`              |                            |                                               |
| `position`           |                            |                                               |
| `previewmap`         |                            |                                               |
| `sharing`            |                            |                                               |
| `mqttInvite`         |                            |                                               |
| `event`              |                            |                                               |
| `notify`             |                            |                                               |
| `countUnreadMessage` |                            |                                               |
| `systemMessage`      |                            |                                               |
| `skin`               |                            |                                               |
| `limit`              |                            |                                               |
| `communities`        |                            |                                               |
| `agreements`         |                            |                                               |
| `settingsX`          |                            |                                               |
| `getTime`            |                            |                                               |
| `appRelease`         |                            |                                               |

## Notes

- All timers are native (`setInterval` / `setTimeout`).
- `pureimage` is loaded lazily inside `renderLivemap`; if it's not installed the renderer emits an `error` and returns `null`.
- `eventcodes.json` ships next to the code (12 language variants).
