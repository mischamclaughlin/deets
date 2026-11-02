export function WorkspaceIcon({ kind }: { kind: "edit" | "preview" | "sun" | "moon" | "snap" | "grid-select" }) {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {kind === "edit" ? <><path d="m4 3 15 10-7 1-3 7z" /></>
            : kind === "preview" ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>
                : kind === "sun" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>
                    : kind === "moon" ? <path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />
                        : kind === "grid-select" ? <><path d="M3 3h16v16H3zM3 8h16M8 3v16" /><path d="m12 11 8 5-4 1-1 4z" fill="currentColor" strokeWidth="1.2" /></>
                            : <><path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3ZM6 7h4m4 0h4" /></>}
    </svg>;
}
