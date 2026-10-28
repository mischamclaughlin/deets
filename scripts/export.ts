import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { callBridge } from "../server/bridge.ts";
import { scene } from "../src/watch/scene.ts";
import type { WatchMapping } from "../shared/scene.ts";

const args = process.argv.slice(2);
if (
    args.some(
        (arg, index) =>
            !["--out", "--proof", "--night"].includes(arg) &&
            args[index - 1] !== "--out",
    )
)
    throw new Error(
        "Use --out <path>, with optional --proof and --night for mapping verification.",
    );
const outIndex = args.indexOf("--out");
if (
    outIndex >= 0 &&
    (!args[outIndex + 1] || args[outIndex + 1].startsWith("--"))
)
    throw new Error("--out requires a file path.");
if (args.includes("--night") && !args.includes("--proof"))
    throw new Error(
        "--night is only available with --proof. Live exports use watch power callbacks.",
    );
const output = resolve(
    outIndex >= 0 ? args[outIndex + 1] : "exports/Deets.prg",
);
const snapshot = structuredClone(scene);
const mapped = await callBridge<WatchMapping>("refresh-fonts", { scene: snapshot });
const result = await callBridge<{ application: string }>("export", {
    scene: mapped.scene,
    mapping: mapped.mapping,
    proof: args.includes("--proof"),
    night: args.includes("--night"),
});
await mkdir(dirname(output), { recursive: true });
const bytes = Buffer.from(result.application, "base64");
await writeFile(output, bytes);
console.log(`Exported ${snapshot.device}: ${output} (${bytes.length} bytes)`);
