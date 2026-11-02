import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { devices, type Device } from "../shared/scene.ts";
import type { DevicePreview } from "../shared/device-preview.ts";
import { GarminError } from "./bridge.ts";

/** Read installed Garmin artwork locally rather than redistributing SDK assets. */
export async function devicePreview(device: string, root = join(homedir(), "Library/Application Support/Garmin/ConnectIQ/Devices")): Promise<DevicePreview> {
    if (!Object.hasOwn(devices, device)) throw new GarminError("Choose a supported watch model.");
    try {
        const directory = join(root, device);
        const [image, metadata] = await Promise.all([
            readFile(join(directory, `${device}.png`)),
            readFile(join(directory, "simulator.json"), "utf8"),
        ]);
        if (image.length < 24 || image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error();
        const width = image.readUInt32BE(16);
        const height = image.readUInt32BE(20);
        const screen = JSON.parse(metadata).display?.location;
        const size = devices[device as Device];
        if (!screen || ![width, height, screen.x, screen.y, screen.width, screen.height].every(Number.isInteger) ||
            width <= 0 || height <= 0 || screen.x < 0 || screen.y < 0 ||
            screen.width !== size || screen.height !== size || screen.x + size > width || screen.y + size > height) throw new Error();
        return { image: `data:image/png;base64,${image.toString("base64")}`, width, height,
            screen: { x: screen.x, y: screen.y, width: screen.width, height: screen.height } };
    } catch {
        throw new GarminError("Watch casing unavailable. Install this model in the local Connect IQ SDK.");
    }
}
