import type { Scene } from "../../shared/scene.ts";
import { ColourInput } from "./ColourInput.tsx";

/** The background belongs to the native scene, independently of the app theme. */
export function WatchBackgroundPanel({ scene, onSceneChange }: {
    scene: Scene;
    onSceneChange: (scene: Scene) => void;
}) {
    return <section className="watch-background-panel" aria-labelledby="watch-background-heading">
        <h2 id="watch-background-heading">Watch background</h2>
        <ColourInput label="Background colour" value={scene.background}
            onChange={(background) => onSceneChange({ ...scene, background })} />
        <p className="control-hint">Applies to the watch’s day appearance. Night stays black for low-power mode.</p>
    </section>;
}
