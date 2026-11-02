/** Small interface icons; these never enter the native watch scene. */
export function ElementIcon({ kind }: { kind: "time" | "date" | "divider" | "other" }) {
    return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {kind === "time" ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5h4" /></>
            : kind === "date" ? <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4m8-4v4M4 10h16m-11 4h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01" /></>
                : kind === "divider" ? <><path d="M4 12h16M4 9v6m16-6v6" /></>
                    : <rect x="5" y="5" width="14" height="14" rx="3" />}
    </svg>;
}
