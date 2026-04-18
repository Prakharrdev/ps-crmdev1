export type MapTheme = "dark" | "light";

export type MapTileLayerConfig = {
  attribution: string;
  url: string;
  detectRetina: boolean;
  maxNativeZoom: number;
  subdomains: string;
};

type GetMapTileLayerConfigParams = {
  theme: MapTheme;
  highQuality?: boolean;
};

export function getMapTileLayerConfig({
  theme,
  highQuality,
}: GetMapTileLayerConfigParams): MapTileLayerConfig {
  if (theme === "dark") {
    return {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://stadiamaps.com/">Stadia Maps</a>',
      url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      detectRetina: true,
      maxNativeZoom: 20,
      subdomains: "abcd",
    };
  }

  return {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    detectRetina: true,
    maxNativeZoom: 20,
    subdomains: "abcd",
  };
}
