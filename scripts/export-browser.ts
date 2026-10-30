/** Capture the real WatchCanvas backing pixels through an isolated Chrome CDP session. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

type Reply = {
    id?: number;
    result?: Record<string, unknown>;
    error?: { message: string };
};

class DevTools {
    private sequence = 0;
    private socket: WebSocket;
    private pending = new Map<number, {
        resolve: (result: Record<string, unknown>) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
    }>();

    constructor(socket: WebSocket) {
        this.socket = socket;
        socket.addEventListener("message", (message) => {
            let reply: Reply;
            try { reply = JSON.parse(String(message.data)) as Reply; }
            catch { this.fail(new Error("Chrome sent an invalid DevTools response.")); return; }
            if (reply.id === undefined) return;
            const request = this.pending.get(reply.id);
            if (!request) return;
            clearTimeout(request.timer);
            this.pending.delete(reply.id);
            if (reply.error) request.reject(new Error(reply.error.message));
            else request.resolve(reply.result ?? {});
        });
        socket.addEventListener("close", () => this.fail(new Error("Chrome closed its DevTools connection.")));
        socket.addEventListener("error", () => this.fail(new Error("Chrome DevTools connection failed.")));
    }

    private fail(error: Error) {
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(error);
        }
        this.pending.clear();
    }

    request(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
        return new Promise<Record<string, unknown>>((resolve, reject) => {
            if (this.socket.readyState !== WebSocket.OPEN) {
                reject(new Error("Chrome DevTools connection is not open."));
                return;
            }
            const id = ++this.sequence;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Chrome timed out during ${method}.`));
            }, 15_000);
            this.pending.set(id, { resolve, reject, timer });
            try { this.socket.send(JSON.stringify({ id, method, params, sessionId })); }
            catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }
}

async function debugAddress(profile: string, chrome: ChildProcess, startupError: () => Error | undefined) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const error = startupError();
        if (error) throw error;
        if (chrome.exitCode !== null || chrome.signalCode !== null)
            throw new Error(`Chrome exited before DevTools was ready (${chrome.exitCode ?? chrome.signalCode}).`);
        try {
            const [port, endpoint] = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
            if (/^\d+$/.test(port) && endpoint?.startsWith("/devtools/browser/"))
                return `ws://127.0.0.1:${port}${endpoint}`;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        await delay(100);
    }
    throw new Error("Chrome did not start its DevTools endpoint within 15 seconds.");
}

async function connect(address: string) {
    const socket = new WebSocket(address);
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error("Chrome DevTools connection timed out."));
        }, 10_000);
        socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener("error", () => {
            clearTimeout(timer);
            reject(new Error("Could not connect to Chrome DevTools."));
        }, { once: true });
    });
    return socket;
}

const captureExpression = `(() => {
    const alert = document.querySelector('[role="alert"]');
    if (alert) return { error: alert.textContent || 'Watch canvas rendering failed.' };
    const canvas = document.querySelector('canvas[aria-label="Native-pixel Garmin watch face"]');
    if (!canvas || canvas.style.visibility !== 'visible' || !canvas.width || !canvas.height) return null;
    return { width: canvas.width, height: canvas.height, image: canvas.toDataURL('image/png') };
})()`;

/** Save native-resolution PNG pixels, excluding CSS guides, labels and device artwork. */
export async function captureCanvas(
    url: string,
    path: string,
    chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
): Promise<void> {
    const target = new URL(url);
    if (target.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
        throw new Error("Canvas capture requires a local HTTP harness URL.");
    const profile = await mkdtemp(join(tmpdir(), "deets-canvas-chrome-"));
    let chrome: ChildProcess | undefined;
    let socket: WebSocket | undefined;
    try {
        chrome = spawn(chromePath, [
            "--headless=new", "--no-first-run", "--no-default-browser-check",
            "--disable-background-networking", "--disable-component-update",
            "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
            `--user-data-dir=${profile}`, "about:blank",
        ], { stdio: "ignore" });
        let startupError: Error | undefined;
        chrome.once("error", (error) => { startupError = new Error(`Chrome could not start: ${error.message}`); });
        socket = await connect(await debugAddress(profile, chrome, () => startupError));
        const devtools = new DevTools(socket);
        const created = await devtools.request("Target.createTarget", { url: "about:blank" });
        const attached = await devtools.request("Target.attachToTarget", { targetId: created.targetId, flatten: true });
        const session = String(attached.sessionId);
        await devtools.request("Page.enable", {}, session);
        const navigation = await devtools.request("Page.navigate", { url }, session);
        if (navigation.errorText) throw new Error(`Canvas navigation failed: ${String(navigation.errorText)}`);
        const deadline = Date.now() + 60_000;
        while (Date.now() < deadline) {
            let evaluated: Record<string, unknown>;
            try {
                evaluated = await devtools.request("Runtime.evaluate", {
                    expression: captureExpression, returnByValue: true,
                }, session);
            } catch (error) {
                if (error instanceof Error && /context.*destroyed|Cannot find context/i.test(error.message)) {
                    await delay(100);
                    continue;
                }
                throw error;
            }
            if (evaluated.exceptionDetails) throw new Error("The browser could not read the watch canvas pixels.");
            const value = (evaluated.result as { value?: { image?: string; error?: string } } | undefined)?.value;
            if (value?.error) throw new Error(value.error);
            if (value?.image) {
                const prefix = "data:image/png;base64,";
                if (!value.image.startsWith(prefix)) throw new Error("Chrome did not produce a canvas PNG.");
                const png = Buffer.from(value.image.slice(prefix.length), "base64");
                if (!png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
                    throw new Error("Chrome returned invalid canvas PNG bytes.");
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, png, { flag: "wx" });
                return;
            }
            await delay(100);
        }
        throw new Error("The watch canvas did not render within 60 seconds.");
    } finally {
        socket?.close();
        if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
            chrome.kill("SIGTERM");
            await Promise.race([new Promise<void>((resolve) => chrome!.once("exit", () => resolve())), delay(2000)]);
            if (chrome.exitCode === null && chrome.signalCode === null) {
                chrome.kill("SIGKILL");
                await Promise.race([new Promise<void>((resolve) => chrome!.once("exit", () => resolve())), delay(2000)]);
            }
        }
        await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
}
