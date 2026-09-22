"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Writable, Readable } = require("node:stream");

let _PImage = null;
let _PImageTried = false;
function loadPImage() {
    if (_PImageTried) {
        return _PImage;
    }
    _PImageTried = true;
    try {
        _PImage = require("pureimage");
    } catch {
        _PImage = null;
    }
    return _PImage;
}

let _robotSprite = { value: null };
let _chargerSprite = { value: null };
/**
 * @param {{ decodePNGFromStream: (arg0: Readable) => any; }} PImage
 * @param {string} name
 * @param {{ value: any; }} cacheRef
 */
async function loadSprite(PImage, name, cacheRef) {
    if (cacheRef.value) {
        return cacheRef.value;
    }
    const file = path.join(__dirname, name);
    if (!fs.existsSync(file)) {
        return null;
    }
    const buf = fs.readFileSync(file);
    const stream = Readable.from(buf);
    cacheRef.value = await PImage.decodePNGFromStream(stream);
    return cacheRef.value;
}

module.exports = {
    /**
     * @param {string} sn
     * @param {string} region
     * @param {any} map
     */
    async fetchMapPreview(sn, region, map) {
        if (this.options.apptype === "Old") {
            return;
        }
        const meta = this.deviceMeta[sn];
        if (!meta || (meta.modelClass !== "S" && meta.modelClass !== "X")) {
            this.iob.log.debug(`fetchMapPreview ${sn}: Skip modelclass ${meta && meta.modelClass} without maps`);
            return;
        }
        try {
            this.iob.log.debug(`fetchMapPreview ${sn}: Reviewmap rendern (mapData=${!!map}) - ${JSON.stringify(map)}`);
            const dataUrl = await this.renderPreviewMap(map, sn, region, meta);
            if (dataUrl) {
                this.emit("previewmap", { sn, dataUrl, region });
                this.iob.log.debug(`fetchMapPreview ${sn}: Reviewmap emitted (${dataUrl.length} Bytes data URL)`);
            } else {
                this.iob.log.debug(`fetchMapPreview ${sn}: Reviewmap not rendered (no geometry)`);
            }
        } catch (e) {
            this.iob.log.warn(`fetchMapPreview: ${e}`);
        }
    },

    /**
     * Create preview Map
     *
     * @param {any} mapData
     * @param {string} sn
     * @param {string} region
     * @param {any} [meta]
     * @returns {Promise<string | null>}
     */
    async renderPreviewMap(mapData, sn, region, meta) {
        if (!mapData || typeof mapData !== "object") {
            return null;
        }
        const PImage = loadPImage();
        if (!PImage) {
            this.emit("error", new Error("renderPreviewMap: optional dependency 'pureimage' missing"));
            return null;
        }
        return this.renderPreviewMapInner(PImage, mapData, sn, region, meta);
    },

    /**
     * @param {any} PImage
     * @param {any} mapData
     * @param {string} sn
     * @param {string} region
     * @param {any} [meta]
     * @returns {Promise<string|null>}
     */
    async renderPreviewMapInner(PImage, mapData, sn, region, meta) {
        const parsePoints = str => {
            if (!str) {
                return [];
            }
            try {
                const arr = typeof str === "string" ? JSON.parse(str) : str;
                if (!Array.isArray(arr)) {
                    return [];
                }
                return arr
                    .map(p => [Number(p[0]), Number(p[1])])
                    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
            } catch {
                return [];
            }
        };
        const settings = this.livemapSettings[sn] ? this.livemapSettings[sn] : this.livemapSettings.default;
        const groups = ["divide_area_work", "region_work"];
        if (
            region === "region_placed_blank" ||
            region === "region_forbidden" ||
            region === "region_obstacle" ||
            region === "region_channel"
        ) {
            groups.push(region);
        }
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const collected = {};
        for (const g of groups) {
            const arr = Array.isArray(mapData[g]) ? mapData[g] : [];
            collected[g] = arr.map(item => parsePoints(item.points)).filter(p => p.length > 0);
            for (const pts of collected[g]) {
                for (const [x, y] of pts) {
                    if (x < minX) {
                        minX = x;
                    }
                    if (x > maxX) {
                        maxX = x;
                    }
                    if (y < minY) {
                        minY = y;
                    }
                    if (y > maxY) {
                        maxY = y;
                    }
                }
            }
        }
        if (!Number.isFinite(minX) || maxX === minX || maxY === minY) {
            return null;
        }
        const width = maxX - minX;
        const height = maxY - minY;
        const SCALE = 25;
        const MAX_DIM = 1500;
        let canvasW = Math.max(1, Math.round(width * SCALE));
        let canvasH = Math.max(1, Math.round(height * SCALE));
        if (canvasW > MAX_DIM || canvasH > MAX_DIM) {
            const f = MAX_DIM / Math.max(canvasW, canvasH);
            canvasW = Math.max(1, Math.round(canvasW * f));
            canvasH = Math.max(1, Math.round(canvasH * f));
        }
        const transform = ([x, y]) => {
            const xn = (x - minX) / (maxX - minX);
            const yn = (y - minY) / (maxY - minY);
            return [Math.round(xn * canvasW), Math.round((1 - yn) * canvasH)];
        };
        const bitmap = PImage.make(canvasW, canvasH);
        if (bitmap.data && typeof bitmap.data.fill === "function") {
            bitmap.data.fill(0);
        }
        const ctx = bitmap.getContext("2d");

        const dedup = pts => {
            const tp = [];
            for (const p of pts) {
                const [x, y] = transform(p);
                if (tp.length === 0 || tp[tp.length - 1][0] !== x || tp[tp.length - 1][1] !== y) {
                    tp.push([x, y]);
                }
            }
            return tp;
        };

        const drawPoly = (pts, fill, stroke, lineWidth = 1) => {
            if (!pts || pts.length < 2) {
                return;
            }
            const tp = dedup(pts);
            while (tp.length > 1 && tp[tp.length - 1][0] === tp[0][0] && tp[tp.length - 1][1] === tp[0][1]) {
                tp.pop();
            }
            const minPoints = fill ? 3 : 2;
            if (tp.length < minPoints) {
                return;
            }
            ctx.beginPath();
            ctx.moveTo(tp[0][0], tp[0][1]);
            for (let i = 1; i < tp.length; i++) {
                ctx.lineTo(tp[i][0], tp[i][1]);
            }
            ctx.closePath();
            if (fill) {
                ctx.fillStyle = fill;
                ctx.fill();
            }
            if (stroke) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = lineWidth;
                ctx.stroke();
            }
        };

        // Oriented arrow head at world (x, y) with world-frame angle (radians).
        // Tip points along the world +X axis at angle 0; positive angle rotates
        // counter-clockwise in world space (Y-flip during transform).
        const drawArrow = (worldX, worldY, angle, size, fill, stroke) => {
            const [cx, cy] = transform([worldX, worldY]);
            const a = Number.isFinite(angle) ? angle : 0;
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            const local = [
                [size, 0],
                [-size * 0.6, size * 0.5],
                [-size * 0.6, -size * 0.5],
            ];
            const pts = local.map(([lx, ly]) => {
                const wx = lx * cos - ly * sin;
                const wy = lx * sin + ly * cos;
                return [Math.round(cx + wx), Math.round(cy - wy)];
            });
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            ctx.lineTo(pts[1][0], pts[1][1]);
            ctx.lineTo(pts[2][0], pts[2][1]);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
        };
        if (region === "region_channel") {
            for (const pts of collected.region_channel) {
                drawPoly(
                    pts,
                    settings.region_channel_fill,
                    settings.region_channel_stroke,
                    settings.region_channel_lineWidth,
                );
            }
        }
        for (const pts of collected.region_work) {
            drawPoly(pts, settings.region_work_fill, settings.region_work_stroke, settings.region_work_lineWidth);
        }
        if (region === "region_forbidden") {
            for (const pts of collected.region_forbidden) {
                drawPoly(
                    pts,
                    settings.region_forbidden_fill,
                    settings.region_forbidden_stroke,
                    settings.region_forbidden_lineWidth,
                );
            }
        }
        if (region === "region_placed_blank") {
            for (const pts of collected.region_placed_blank) {
                drawPoly(
                    pts,
                    settings.region_placed_blank_fill,
                    settings.region_placed_blank_stroke,
                    settings.region_placed_blank_lineWidth,
                );
            }
        }
        if (region === "region_obstacle") {
            for (const pts of collected.region_obstacle) {
                drawPoly(
                    pts,
                    settings.region_obstacle_fill,
                    settings.region_obstacle_stroke,
                    settings.region_obstacle_lineWidth,
                );
            }
        }
        // Sprites once (cached). If missing, fall back to drawArrow.
        const robotSprite = await loadSprite(PImage, settings.robot_path, _robotSprite).catch(() => null);
        const chargerSprite = await loadSprite(PImage, settings.charger_path, _chargerSprite).catch(() => null);
        const spriteScale = (canvasW + canvasH) / settings.robot_charger_scale / 1000;

        const drawSprite = (sprite, worldX, worldY, angleRad) => {
            const [cx, cy] = transform([worldX, worldY]);
            const w = Math.max(1, Math.round(sprite.width * spriteScale));
            const h = Math.max(1, Math.round(sprite.height * spriteScale));
            ctx.save();
            ctx.translate(cx, cy);
            // PNG points "up" by default; angle is canvas-CW. The Y-flip in
            // transform() inverts the rotation sense, so negate here.
            ctx.rotate(-(Number.isFinite(angleRad) ? angleRad : 0));
            ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, -w / 2, -h / 2, w, h);
            ctx.restore();
        };

        // Charger: prefer MQTT-pushed pos, fall back to static map data.
        let chargerWorld = null;
        let chargerAngle = 0;
        if (meta && meta.chargerPos) {
            chargerWorld = [meta.chargerPos.x, meta.chargerPos.y];
            chargerAngle = meta.chargerPos.angle || 0;
        } else if (mapData.charge_pos && Array.isArray(mapData.charge_pos.point)) {
            const pt = mapData.charge_pos.point;
            if (pt.length >= 2 && (pt[0] !== 0 || pt[1] !== 0)) {
                chargerWorld = [Number(pt[0]), Number(pt[1])];
                chargerAngle = Number(mapData.charge_pos.angle) || 0;
            }
        }
        if (chargerWorld && Number.isFinite(chargerWorld[0]) && Number.isFinite(chargerWorld[1])) {
            if (chargerSprite) {
                drawSprite(chargerSprite, chargerWorld[0], chargerWorld[1], chargerAngle);
            } else {
                drawArrow(chargerWorld[0], chargerWorld[1], chargerAngle, 9, "rgba(255,200,0,1)", "rgba(0,0,0,1)");
            }
        }

        // Mower (only available via MQTT).
        if (meta && meta.robotPos && Number.isFinite(meta.robotPos.x) && Number.isFinite(meta.robotPos.y)) {
            if (robotSprite) {
                drawSprite(robotSprite, meta.robotPos.x, meta.robotPos.y, meta.robotPos.angle || 0);
            } else {
                drawArrow(
                    meta.robotPos.x,
                    meta.robotPos.y,
                    meta.robotPos.angle || 0,
                    10,
                    "rgba(255,0,0,1)",
                    "rgba(0,0,0,1)",
                );
            }
        }

        const chunks = [];
        const sink = new Writable({
            write(chunk, _enc, cb) {
                chunks.push(Buffer.from(chunk));
                cb();
            },
        });
        await PImage.encodePNGToStream(bitmap, sink);
        const buf = Buffer.concat(chunks);
        return `data:image/png;base64,${buf.toString("base64")}`;
    },
};
