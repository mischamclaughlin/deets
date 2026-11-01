import { useId, useRef, useState } from "react";
import { evaluateSliderExpression } from "./slider-expression.ts";
import "./SliderValue.css";

/** The editable value beside a slider; calculations share its numeric bounds. */
export function SliderValue({ value, min, max, unit = "px", label, disabled = false, onChange }: {
    value: number | undefined;
    min: number;
    max: number;
    unit?: string;
    label: string;
    disabled?: boolean;
    onChange: (value: number) => void;
}) {
    const [draft, setDraft] = useState<{ base: number | undefined; text: string }>();
    const [error, setError] = useState<string>();
    const cancelled = useRef(false);
    const errorId = useId();
    const currentDraft = draft?.base === value ? draft : undefined;
    const text = currentDraft?.text ?? (value === undefined ? "" : String(value));
    const message = currentDraft ? error : undefined;
    return <span className="slider-value-group">
        <span className="slider-value" data-invalid={!!message}>
            <input type="text" aria-label={`${label} value (${unit})`} disabled={disabled}
                aria-invalid={!!message || undefined} aria-describedby={message ? errorId : undefined}
                title="Enter a number or calculation, such as 88 + 12. Enter to apply; Escape to cancel."
                maxLength={128} size={Math.min(22, Math.max(2, text.length))}
                value={text} placeholder={value === undefined ? "Mixed" : undefined}
                onFocus={(event) => { cancelled.current = false; setDraft({ base: value, text: event.currentTarget.value }); event.currentTarget.select(); }}
                onChange={(event) => { setDraft({ base: value, text: event.target.value }); setError(undefined); }}
                onBlur={(event) => {
                    if (cancelled.current || disabled) { cancelled.current = false; setDraft(undefined); return; }
                    if (currentDraft === undefined || (value === undefined && !event.currentTarget.value.trim())) return;
                    try {
                        const next = evaluateSliderExpression(event.currentTarget.value, min, max);
                        if (next !== value) onChange(next);
                        setDraft(undefined);
                        setError(undefined);
                    } catch (failure) {
                        setError(failure instanceof Error ? failure.message : "Enter a valid calculation.");
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
                    if (event.key === "Escape") {
                        event.preventDefault(); event.stopPropagation(); cancelled.current = true;
                        setDraft(undefined); setError(undefined); event.currentTarget.blur();
                    }
                }} />
            <span aria-hidden="true">{unit}</span>
        </span>
        {message && <span id={errorId} className="slider-value-error" role="alert">{message}</span>}
    </span>;
}
