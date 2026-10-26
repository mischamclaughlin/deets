import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export type Operation = "layout" | "export" | "health";
export class GarminError extends Error {}

/** Python owns the proven raster/compiler boundary; no shell or key contents cross it. */
export function callBridge<T>(
    operation: Operation,
    payload: unknown,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.env.DEETS_PYTHON ?? "python3",
            [
                fileURLToPath(
                    new URL("../garmin/tools/bridge.py", import.meta.url),
                ),
            ],
            {
                stdio: ["pipe", "pipe", "pipe"],
            },
        );
        let output = "";
        let settled = false;
        const finish = (error?: Error, result?: T) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(result as T);
        };
        const timer = setTimeout(
            () => {
                child.kill("SIGKILL");
                finish(
                    new GarminError(
                        "The Garmin operation exceeded its time limit.",
                    ),
                );
            },
            operation === "export" ? 135_000 : 20_000,
        );
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            output += chunk;
            if (output.length > 4_000_000) {
                child.kill("SIGKILL");
                finish(
                    new GarminError(
                        "The Garmin response exceeded its size limit.",
                    ),
                );
            }
        });
        // Diagnostic machine paths and compiler output do not enter HTTP responses.
        child.stderr.resume();
        child.once("error", () =>
            finish(
                new GarminError(
                    "Python could not start the local Garmin bridge.",
                ),
            ),
        );
        child.once("close", (code) => {
            if (settled) return;
            if (code !== 0)
                return finish(
                    new GarminError(
                        "The local Garmin bridge could not complete the request.",
                    ),
                );
            try {
                const reply: { ok: boolean; result?: T; error?: string } =
                    JSON.parse(output);
                if (reply.ok !== true)
                    return finish(
                        new GarminError(
                            reply.error ?? "The Garmin request was rejected.",
                        ),
                    );
                finish(undefined, reply.result);
            } catch {
                finish(
                    new GarminError(
                        "The local Garmin bridge returned an invalid response.",
                    ),
                );
            }
        });
        child.stdin.on("error", () =>
            finish(new GarminError("The Garmin bridge connection closed.")),
        );
        child.stdin.end(JSON.stringify({ operation, payload }));
    });
}
