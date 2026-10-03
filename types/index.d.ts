export type PastedImage = {
  n: number
  /** Absolute path of the cached PNG; null when it can't be found. */
  path: string | null
  /** Pixel size; null when unknown, and the tile falls back to a default shape. */
  size: { width: number; height: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'cc-image-view': { images: PastedImage[] }
  }
}
