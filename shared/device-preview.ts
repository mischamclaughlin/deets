/** Browser presentation only; these dimensions never enter scene or export data. */
export interface DevicePreview {
    image: string;
    width: number;
    height: number;
    screen: { x: number; y: number; width: number; height: number };
}
