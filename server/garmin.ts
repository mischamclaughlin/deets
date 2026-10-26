import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import type { WatchMapping } from "../shared/scene.ts";
import { callBridge, GarminError } from "./bridge.ts";

const MAX_BODY = 65_536;
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

/** Same-origin local API used by Vite dev and preview; it has no account or storage layer. */
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
                    !["/api/garmin/layout", "/api/garmin/export"].includes(
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
                const allowed = exporting
                    ? ["scene", "mapping"]
                    : ["scene", "night"];
                if (
                    Object.keys(payload).some(
                        (key) => !allowed.includes(key),
                    ) ||
                    !("scene" in payload)
                )
                    return sendError(
                        response,
                        400,
                        "The request has unsupported or missing fields.",
                    );
                if (!exporting) {
                    const result = await callBridge<WatchMapping>(
                        "layout",
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
                        error instanceof GarminError ? 400 : 500,
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
