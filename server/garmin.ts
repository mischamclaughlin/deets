import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, lstat, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { WatchMapping } from "../shared/scene.ts";
import { callBridge, GarminError } from "./bridge.ts";

const MAX_BODY = 65_536;
const MAX_FONT = 5 * 1024 * 1024;

class RequestError extends GarminError {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/** Uploaded font names are metadata only; content hashes own every cache path. */
async function uploadFont(request: IncomingMessage) {
    if (request.headers["content-type"] !== "application/octet-stream")
        throw new RequestError(415, "Upload a TTF or OTF font as application/octet-stream.");
    const header = request.headers["x-font-name"];
    let name: string;
    try {
        if (typeof header !== "string" || header.length > 1024) throw new Error();
        name = decodeURIComponent(header);
        if (!name || name.length > 255 || name !== basename(name) || name.includes("\\") ||
            Array.from(name).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
            throw new Error();
    } catch {
        throw new RequestError(400, "Provide a valid font filename.");
    }
    if (![".ttf", ".otf"].includes(extname(name).toLowerCase()))
        throw new RequestError(415, "Choose a TTF or OTF font.");
    const length = request.headers["content-length"];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_FONT))
        throw new RequestError(413, "Fonts must be no larger than 5 MB.");
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += part.length;
        if (bytes > MAX_FONT) throw new RequestError(413, "Fonts must be no larger than 5 MB.");
        chunks.push(part);
    }
    const font = Buffer.concat(chunks, bytes);
    if (font.length < 12 || !["00010000", "4f54544f"].includes(font.subarray(0, 4).toString("hex")))
        throw new RequestError(400, "This file is not a supported TTF or OTF font.");
    const digest = createHash("sha256").update(font).digest("hex");
    const directory = join(tmpdir(), "deets-fonts-v1");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
        throw new RequestError(400, "The local font cache is unavailable.");
    const temporary = join(directory, `.${digest}.${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, font, { flag: "wx", mode: 0o600 });
        await rename(temporary, join(directory, `${digest}.font`));
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
    return { id: `upload:${digest}`, name };
}
const sendError = (
    response: ServerResponse,
    status: number,
    message: string,
) => {
    response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ error: message }));
};

async function body(
    request: IncomingMessage,
): Promise<Record<string, unknown>> {
    let text = "";
    for await (const chunk of request) {
        text += String(chunk);
        if (Buffer.byteLength(text) > MAX_BODY)
            throw new GarminError("The scene exceeds the request limit.");
    }
    try {
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error();
        return value as Record<string, unknown>;
    } catch {
        throw new GarminError("A JSON scene object is required.");
    }
}

/** Same-origin local API with temporary local font assets, shared by Vite dev and preview. */
export function garmin(): Plugin {
    let compiling = false;
    const install = (
        server: Pick<ViteDevServer, "middlewares" | "httpServer" | "config">,
    ) => {
        server.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith("/api/garmin/")) return next();
            const handle = async () => {
                const address = server.httpServer?.address();
                const port =
                    address && typeof address !== "string"
                        ? address.port
                        : server.config.server.port;
                const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
                if (
                    !request.headers.host ||
                    !hosts.includes(request.headers.host)
                )
                    return sendError(
                        response,
                        403,
                        "Use this app from its local server address.",
                    );
                if (
                    request.method === "POST" &&
                    !hosts.some(
                        (host) => request.headers.origin === `http://${host}`,
                    )
                )
                    return sendError(
                        response,
                        403,
                        "A same-origin request is required.",
                    );
                if (
                    request.method === "GET" &&
                    request.url === "/api/garmin/health"
                ) {
                    response.writeHead(200, {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    });
                    response.end(
                        JSON.stringify(await callBridge("health", {})),
                    );
                    return;
                }
                if (
                    !["/api/garmin/layout", "/api/garmin/export", "/api/garmin/typography", "/api/garmin/font", "/api/garmin/clock", "/api/garmin/add", "/api/garmin/watch-font", "/api/garmin/inherit-font", "/api/garmin/divider", "/api/garmin/seconds-size", "/api/garmin/text-defaults", "/api/garmin/apply-text-defaults", "/api/garmin/copy-element", "/api/garmin/delete-element", "/api/garmin/text-presets", "/api/garmin/apply-text-preset"].includes(
                        request.url ?? "",
                    )
                )
                    return sendError(
                        response,
                        404,
                        "Unknown Garmin operation.",
                    );
                if (request.method !== "POST")
                    return sendError(
                        response,
                        405,
                        "This operation requires POST.",
                    );
                if (request.url === "/api/garmin/font") {
                    const font = await uploadFont(request);
                    response.writeHead(200, {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    });
                    response.end(JSON.stringify(font));
                    return;
                }
                if (
                    !request.headers["content-type"]?.startsWith(
                        "application/json",
                    )
                )
                    return sendError(
                        response,
                        415,
                        "A JSON scene is required.",
                    );
                const payload = await body(request);
                const exporting = request.url === "/api/garmin/export";
                const presets = request.url === "/api/garmin/text-presets";
                const applyPreset = request.url === "/api/garmin/apply-text-preset";
                const defaults = request.url === "/api/garmin/text-defaults";
                const action = request.url === "/api/garmin/copy-element" ? "copy-element"
                    : request.url === "/api/garmin/delete-element" ? "delete-element"
                        : request.url === "/api/garmin/apply-text-defaults" ? "apply-text-defaults" : undefined;
                const typography = request.url === "/api/garmin/typography";
                const clock = request.url === "/api/garmin/clock";
                const secondsSize = request.url === "/api/garmin/seconds-size";
                const divider = request.url === "/api/garmin/divider";
                const adding = request.url === "/api/garmin/add";
                const watchFont = request.url === "/api/garmin/watch-font";
                const inheritFont = request.url === "/api/garmin/inherit-font";
                const allowed = exporting
                    ? ["scene", "mapping"]
                    : presets ? ["scene", "presets", "defaultPresetId"]
                        : applyPreset ? ["scene", "elementId", "presetId"]
                        : defaults ? ["scene", "defaults"]
                        : action ? ["scene", "elementId"]
                        : typography ? ["scene", "elementId", "typography"]
                        : secondsSize ? ["scene", "elementId", "size"]
                        : divider ? ["scene", "elementId", "symbol"]
                        : clock ? ["scene", "elementId", "source"]
                            : adding ? ["scene", "source"]
                                : watchFont ? ["scene", "family"]
                                    : inheritFont ? ["scene", "elementId", "inherit"] : ["scene", "night"];
                if (
                    Object.keys(payload).some(
                        (key) => !allowed.includes(key),
                    ) ||
                    !("scene" in payload) ||
                    (presets && (!("presets" in payload) || !("defaultPresetId" in payload))) ||
                    (applyPreset && (!("elementId" in payload) || !("presetId" in payload))) ||
                    (defaults && !("defaults" in payload)) ||
                    (action && !("elementId" in payload)) ||
                    (typography && (!("elementId" in payload) || !("typography" in payload))) ||
                    (clock && (!("elementId" in payload) || !("source" in payload))) ||
                    (secondsSize && (!("elementId" in payload) || !("size" in payload))) ||
                    (divider && (!("elementId" in payload) || !("symbol" in payload))) ||
                    (adding && !("source" in payload)) ||
                    (watchFont && !("family" in payload)) ||
                    (inheritFont && (!("elementId" in payload) || !("inherit" in payload)))
                )
                    return sendError(
                        response,
                        400,
                        "The request has unsupported or missing fields.",
                    );
                if (!exporting) {
                    const result = await callBridge<WatchMapping>(
                        action ?? (presets ? "text-presets" : applyPreset ? "apply-text-preset" : defaults ? "text-defaults" : typography ? "typography" : secondsSize ? "seconds-size" : divider ? "divider" : clock ? "clock" : adding ? "add"
                            : watchFont ? "watch-font" : inheritFont ? "inherit-font" : "layout"),
                        payload,
                    );
                    response.writeHead(200, {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store",
                    });
                    response.end(JSON.stringify(result));
                    return;
                }
                if (compiling)
                    return sendError(
                        response,
                        409,
                        "A Garmin export is already running.",
                    );
                compiling = true;
                try {
                    const result = await callBridge<{
                        application: string;
                        device: string;
                    }>("export", payload);
                    const application = Buffer.from(
                        result.application,
                        "base64",
                    );
                    response.writeHead(200, {
                        "Content-Type": "application/octet-stream",
                        "Content-Length": application.length,
                        "Content-Disposition": `attachment; filename="Deets-${result.device}.prg"`,
                        "Cache-Control": "no-store",
                    });
                    response.end(application);
                } finally {
                    compiling = false;
                }
            };
            void handle().catch((error) => {
                if (!response.headersSent)
                    sendError(
                        response,
                        error instanceof RequestError ? error.status : error instanceof GarminError ? 400 : 500,
                        error instanceof GarminError
                            ? error.message
                            : "The Garmin operation could not complete.",
                    );
                else response.end();
            });
        });
    };
    return {
        name: "deets-garmin",
        configureServer: install,
        configurePreviewServer: install,
    };
}
