import type { ActivitySource } from "../../shared/scene.ts";

const activities = [
    { label: "Steps", value: "steps", icon: "stepsIcon", graph: "stepsWeek", detail: "Today's steps · graph shows Monday–Sunday" },
    { label: "Walking", value: "weeklyWalk", icon: "walkIcon", graph: "walkWeek", detail: "This week's recorded walking distance · Monday–Sunday" },
    { label: "Running", value: "weeklyRun", icon: "runIcon", graph: "runWeek", detail: "This week's running distance · Monday–Sunday" },
] as const;

export function ActivityLibrary({ onAdd, adding, disabled }: {
    onAdd: (source: ActivitySource) => void;
    adding?: string;
    disabled: boolean;
}) {
    return <section aria-label="Activity fields">
        <h3>Activity</h3>
        <p className="panel-intro">Sample values on the canvas. Exported fields use watch data and the watch's distance units. Each graph has seven daily bars.</p>
        {activities.map((activity) => <div key={activity.value}>
            <h4>{activity.label}</h4>
            <p className="panel-intro">{activity.detail}</p>
            <div className="library-grid">
                {([['Value', activity.value], ['Icon', activity.icon], ['Weekly graph', activity.graph]] as const).map(([label, source]) =>
                    <button key={source} type="button" className="add-element"
                        disabled={disabled}
                        onClick={() => onAdd(source)} aria-label={`Add ${activity.label.toLowerCase()} ${label.toLowerCase()}`}>
                        {adding === source ? "Adding…" : label}<span className="library-plus" aria-hidden="true">+</span>
                    </button>)}
            </div>
        </div>)}
    </section>;
}
