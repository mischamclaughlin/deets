import { useState, type ReactNode } from "react";
import type { LibraryCategory } from "./library-catalogue.ts";

export function LibrarySection({ category, title, count, context, initiallyOpen, forceOpen = false, children }: {
    category: Exclude<LibraryCategory, "all">; title: string; count: number;
    context: "sidebar" | "picker"; initiallyOpen: boolean; forceOpen?: boolean; children: ReactNode;
}) {
    const storageKey = `deets-library-${context}-${category}`;
    const [expanded, setExpanded] = useState(() => {
        if (forceOpen) return true;
        try { const saved = localStorage.getItem(storageKey); return saved === null ? initiallyOpen : saved !== "closed"; }
        catch { return initiallyOpen; }
    });
    return <details className={`library-section library-section-${context}`} open={expanded}
        onToggle={(event) => {
            const open = event.currentTarget.open;
            setExpanded(open);
            if (forceOpen) return;
            try { localStorage.setItem(storageKey, open ? "open" : "closed"); } catch { /* Expansion still works without storage. */ }
        }}>
        <summary><span>{title}</span><span className="library-section-count" aria-label={`${count} ${count === 1 ? "choice" : "choices"}`}>{count}</span></summary>
        {children}
    </details>;
}
