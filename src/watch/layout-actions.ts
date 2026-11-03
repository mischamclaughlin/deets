import type { LayoutAction } from './layout-geometry.ts';

export const layoutActions: readonly [LayoutAction, string][] = [
    ['left', 'Left'], ['centreX', 'Centre horizontally'], ['right', 'Right'],
    ['top', 'Top'], ['centreY', 'Centre vertically'], ['bottom', 'Bottom'],
    ['distributeX', 'Space horizontally'], ['distributeY', 'Space vertically'],
];
