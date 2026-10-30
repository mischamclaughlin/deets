/** Load a proof programme and save native pixels through Garmin's own capture menu. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { devices } from "../shared/scene.ts";

const execute = promisify(execFile);
const appleScript = fileURLToPath(new URL("./capture-garmin.applescript", import.meta.url));
const tools = fileURLToPath(new URL("../garmin/tools", import.meta.url));

async function requireNew(path: string) {
    try { await lstat(path); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    throw new Error(`Capture output already exists: ${path}`);
}

async function stopLoader(loader: ChildProcess) {
    if (!loader.pid || loader.exitCode !== null || loader.signalCode !== null) return;
    // Detached mode creates a group containing only this loader and its Java/shell children.
    try { process.kill(-loader.pid, "SIGTERM"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    await Promise.race([new Promise<void>((done) => loader.once("exit", () => done())), delay(2000)]);
    if (loader.exitCode === null && loader.signalCode === null) {
        try { process.kill(-loader.pid, "SIGKILL"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
}

/** Proof builds must print the unique marker after their first completed draw. */
export async function captureNative(program: string, device: string, output: string, logPath: string, marker: string): Promise<void> {
    if (!Object.hasOwn(devices, device)) throw new Error("Choose a supported Garmin capture device.");
    if (process.platform !== "darwin") throw new Error("Native screenshot automation currently requires macOS.");
    if (!/^DEETS_CAPTURE_READY:[a-zA-Z0-9-]{8,100}$/.test(marker))
        throw new Error("Native capture requires a unique proof-build readiness marker.");
    program = resolve(program);
    output = resolve(output);
    logPath = resolve(logPath);
    if (!output.toLowerCase().endsWith(".png")) throw new Error("Native capture output must have a .png extension.");
    if (program === output || program === logPath || output === logPath)
        throw new Error("Programme, capture and log paths must be separate.");
    await requireNew(output);
    await requireNew(logPath);
    if (!(await lstat(program)).isFile()) throw new Error("The compiled Garmin programme is missing.");
    const discovered = await execute(process.env.DEETS_PYTHON ?? "python3", ["-c",
        "import sys,json;sys.path.insert(0,sys.argv[1]);import bridge;compiler,_,java,available=bridge.compiler_config();assert available,'Garmin toolchain is unavailable';print(json.dumps({'bin':str(compiler.parent),'java':str(java)}))",
        tools,
    ], { timeout: 15_000, maxBuffer: 64 * 1024 });
    const sdk = JSON.parse(discovered.stdout) as { bin: string; java: string };
    const environment = { ...process.env, JAVA_HOME: sdk.java, PATH: `${join(sdk.java, "bin")}:${process.env.PATH ?? ""}` };
    await mkdir(dirname(output), { recursive: true });
    await mkdir(dirname(logPath), { recursive: true });
    let loader: ChildProcess | undefined;
    let log = "";
    let failure: Error | undefined;
    try {
        await execute(join(sdk.bin, "connectiq"), [], { env: environment, timeout: 15_000, maxBuffer: 64 * 1024 });
        // Checks the simulator process via the same authorised accessibility route used below.
        await execute("osascript", [appleScript, "ready"], { timeout: 15_000, maxBuffer: 64 * 1024 });
        loader = spawn(join(sdk.bin, "monkeydo"), [program, device], {
            env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"],
        });
        let loaderError: Error | undefined;
        let frameReady = false;
        let stdoutTail = "";
        let logBytes = 0;
        loader.once("error", (error) => { loaderError = error; });
        const collect = (chunk: Buffer) => {
            logBytes += chunk.length;
            if (logBytes > 1024 * 1024) {
                loaderError = new Error("Garmin loader output exceeded 1 MB.");
                return;
            }
            log += chunk.toString("utf8");
        };
        loader.stdout!.on("data", (chunk: Buffer) => {
            collect(chunk);
            const stdoutText = stdoutTail + chunk.toString("utf8");
            if (stdoutText.includes(marker)) frameReady = true;
            stdoutTail = stdoutText.slice(-4096);
        });
        loader.stderr!.on("data", collect);
        const deadline = Date.now() + 30_000;
        while (!frameReady) {
            if (loaderError) throw loaderError;
            if (loader.exitCode !== null || loader.signalCode !== null)
                throw new Error(`Garmin programme stopped before its first confirmed draw (${loader.exitCode ?? loader.signalCode}). See ${logPath}`);
            if (Date.now() >= deadline)
                throw new Error(`Garmin programme did not confirm its first draw within 30 seconds. See ${logPath}`);
            await delay(100);
        }
        // The marker follows drawing; allow the simulator to present that completed frame.
        await delay(200);
        if (loaderError || loader.exitCode !== null || loader.signalCode !== null)
            throw loaderError ?? new Error("Garmin programme stopped before screen capture.");
        await requireNew(output);
        try {
            await execute("osascript", [appleScript, "capture", dirname(output), basename(output)], {
                timeout: 35_000, maxBuffer: 128 * 1024,
            });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (/-1743|not authori[sz]ed|not allowed assistive|1002/i.test(detail))
                throw new Error(`macOS blocked simulator menu automation. Apple Events and Accessibility access must already be allowed for the calling app; no permissions were changed. ${detail}`, { cause: error });
            throw error;
        }
        const savedDeadline = Date.now() + 5_000;
        while (true) {
            try {
                const image = await readFile(output);
                if (image.length >= 24 && image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
            if (Date.now() >= savedDeadline) throw new Error("Garmin did not save a valid PNG capture within five seconds.");
            await delay(100);
        }
    } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        if (/-1743|not authori[sz]ed|not allowed assistive|1002/i.test(failure.message) && !failure.message.startsWith("macOS blocked"))
            failure = new Error(`macOS blocked simulator menu automation. Apple Events and Accessibility access must already be allowed for the calling app; no permissions were changed. ${failure.message}`);
        throw failure;
    } finally {
        if (loader) await stopLoader(loader);
        await writeFile(logPath, `${log}${failure ? `\nCapture failed: ${failure.message}\n` : ""}`, { flag: "wx" });
    }
}
