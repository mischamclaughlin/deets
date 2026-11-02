import { useRef, useState } from "react";
import { uploadFont } from "./api.ts";

export interface UploadedFont { id: string; name: string }

/** Included and local uploaded families share the same native font pipeline. */
export function FontPicker({ family, onChange, uploads, onUpload, disabled = false }: {
    family: string;
    onChange: (family: string) => void;
    uploads: UploadedFont[];
    onUpload: (font: UploadedFont) => void;
    disabled?: boolean;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string>();
    return <>
        <label className="font-choice">
            Font
            <select value={family} disabled={disabled || uploading} onChange={(event) => onChange(event.target.value)}>
                <option value="garmin">Garmin · Roboto Condensed</option>
                <option value="time">JetBrains Mono Regular</option>
                <option value="widget">JetBrains Mono NL Thin</option>
                {family.startsWith("upload:") && !uploads.some((font) => font.id === family) &&
                    <option value={family}>Uploaded font</option>}
                {uploads.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}
            </select>
        </label>
        <input ref={input} type="file" accept=".ttf,.otf" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setUploading(true);
            setError(undefined);
            void uploadFont(file).then((font) => {
                onUpload(font);
                onChange(font.id);
            }).catch((failure) => {
                setError(failure instanceof Error ? failure.message : "The font could not be uploaded.");
            }).finally(() => setUploading(false));
        }} />
        <button className="font-upload" type="button" disabled={disabled || uploading} onClick={() => input.current?.click()}>
            {uploading ? "Uploading…" : "Upload font…"}
        </button>
        {!disabled && <p className="upload-hint">TrueType (.ttf) or OpenType (.otf)</p>}
        {error && <p className="typography-status" role="alert">{error}</p>}
    </>;
}
