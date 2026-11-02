import './ThemeToggle.css';

export function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
    const next = theme === 'light' ? 'dark' : 'light';
    return <button type="button" className="theme-toggle" onClick={onToggle}
        aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
        <svg className="theme-toggle-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </svg>
        <svg className="theme-toggle-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M20 14A8.5 8.5 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />
        </svg>
    </button>;
}
