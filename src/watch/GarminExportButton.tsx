import { useRef, useState } from "react";
import type { Scene } from "../../shared/scene.ts";
import type { EditorLayout } from "./editor-layout.ts";
import type { GridSettings } from "./grid.ts";
import { exportGarmin } from "./api.ts";
import "./GarminExportButton.css";

export function GarminExportButton({ scene, grid, layout, disabled = false }: { scene: Scene; grid: GridSettings; layout?: EditorLayout; disabled?: boolean }) {
    const running = useRef(false);
    const [exporting, setExporting] = useState(false);
    const [result, setResult] = useState<{ scene: Scene; filename?: string; error?: string }>();

    async function download() {
        if (running.current) return;
        running.current = true;
        setExporting(true);
        setResult(undefined);
        const snapshot = structuredClone(scene);
        try {
            const program = await exportGarmin(snapshot, undefined, grid, layout);
            const filename = `Deets-${snapshot.device}.prg`;
            const url = URL.createObjectURL(program);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.append(link);
            try {
                link.click();
            } finally {
                link.remove();
                // Allow the browser to start saving before releasing the file.
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }
            setResult({ scene, filename });
        } catch (failure) {
            setResult({ scene, error: failure instanceof Error ? failure.message : "The Garmin export could not complete. Try again." });
        } finally {
            running.current = false;
            setExporting(false);
        }
    }

    return <div className="garmin-export">
        <button type="button" className="workspace-file-button garmin-export-button" disabled={disabled || exporting}
            onClick={() => void download()} aria-busy={exporting}
            title="Download this design as a compiled Garmin .prg file for the selected watch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
            </svg>
            {exporting ? "Exporting…" : "Export Garmin"}
        </button>
        <div className="garmin-export-feedback">
            <p role="status">{exporting ? "Compiling the design you selected. You can keep editing."
                : result?.filename ? <>{result.filename} · Download started. Copy to GARMIN/APPS on your watch.{result.scene !== scene && " Canvas changed — export again for the latest design."}</>
                    : ""}</p>
            {result?.error && <p role="alert">{result.error}</p>}
        </div>
    </div>;
}
