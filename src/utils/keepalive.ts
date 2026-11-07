import { KeepalivePreset, DEFAULT_KEEPALIVE_PRESET } from "@/types";

export const KEEPALIVE_PRESETS: Record<
  KeepalivePreset,
  { intervalSecs: number; max: number; labelKey: string; detailKey: string }
> = {
  off: { intervalSecs: 0, max: 0, labelKey: "settings.hosts.keepalivePresets.off.label", detailKey: "settings.hosts.keepalivePresets.off.detail" },
  fast: { intervalSecs: 1, max: 3, labelKey: "settings.hosts.keepalivePresets.fast.label", detailKey: "settings.hosts.keepalivePresets.fast.detail" },
  balanced: { intervalSecs: 3, max: 3, labelKey: "settings.hosts.keepalivePresets.balanced.label", detailKey: "settings.hosts.keepalivePresets.balanced.detail" },
  tolerant: { intervalSecs: 10, max: 3, labelKey: "settings.hosts.keepalivePresets.tolerant.label", detailKey: "settings.hosts.keepalivePresets.tolerant.detail" },
};

/** Android freezes the app's network shortly after it leaves the foreground, so
 * the probes queued meanwhile all time out on resume and kill a link that is
 * still alive. A longer window lets the first replies after resume land. */
export const ANDROID_KEEPALIVE = { intervalSecs: 10, max: 6 } as const;

/** Resolves keepalive settings for a preset. On Android, keepalive is never tighter than
 * ANDROID_KEEPALIVE unless explicitly "off". */
export function resolveKeepalive(
  preset: KeepalivePreset,
  platform?: string | null,
): { intervalSecs: number; max: number } {
  const base = KEEPALIVE_PRESETS[preset] ?? KEEPALIVE_PRESETS[DEFAULT_KEEPALIVE_PRESET];
  if (platform !== "android" || base.intervalSecs === 0) {
    return { intervalSecs: base.intervalSecs, max: base.max };
  }
  return {
    intervalSecs: Math.max(base.intervalSecs, ANDROID_KEEPALIVE.intervalSecs),
    max: Math.max(base.max, ANDROID_KEEPALIVE.max),
  };
}

/** Like resolveKeepalive, but never tighter than ANDROID_KEEPALIVE on Android ("off" stays off). */
export const resolveKeepaliveFor = resolveKeepalive;
