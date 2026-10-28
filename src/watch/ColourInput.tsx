import { useId, useState } from "react";

const colourHex = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;

export function ColourInput({ label, value, onChange, disabled = false }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}) {
    const id = useId();
    const [editing, setEditing] = useState<string>();
    return <div className="colour-control">
        <label htmlFor={id}>{label}</label>
        <div className="colour-inputs">
            <input type="color" value={colourHex(value)} disabled={disabled} aria-label={`${label} picker`}
                onChange={(event) => onChange(Number.parseInt(event.target.value.slice(1), 16))} />
            <input id={id} type="text" value={editing ?? colourHex(value)} disabled={disabled} maxLength={7}
                spellCheck={false} aria-invalid={editing !== undefined && !/^#?[0-9a-fA-F]{6}$/.test(editing)}
                onFocus={() => setEditing(colourHex(value))} onBlur={() => setEditing(undefined)}
                onChange={(event) => {
                    const text = event.target.value;
                    setEditing(text);
                    if (/^#?[0-9a-fA-F]{6}$/.test(text)) onChange(Number.parseInt(text.replace(/^#/, ""), 16));
                }} />
        </div>
    </div>;
}
