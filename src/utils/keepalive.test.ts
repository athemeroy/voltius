import { DEFAULT_KEEPALIVE_PRESET, resolveKeepalive } from "./keepalive.ts";
import { test } from "vitest";

test("keepalive", async () => {
function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`FAIL ${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    throw new Error(msg);
  }
}

assertEqual(DEFAULT_KEEPALIVE_PRESET, "balanced", "default preset is balanced");
assertEqual(resolveKeepalive(DEFAULT_KEEPALIVE_PRESET), { intervalSecs: 3, max: 3 }, "balanced resolves to 3/3");
});

test("android keepalive is never tighter than the android floor", async () => {
  const { resolveKeepalive, resolveKeepaliveFor } = await import("./keepalive.ts");
  const a = resolveKeepaliveFor("balanced", "android");
  if (a.intervalSecs !== 10 || a.max !== 6) throw new Error("android balanced");
  if (resolveKeepaliveFor("fast", "android").intervalSecs !== 10) throw new Error("fast raised to android floor");
  if (resolveKeepaliveFor("tolerant", "android").intervalSecs !== 10) throw new Error("tolerant raised to android floor");
  if (resolveKeepaliveFor("off", "android").intervalSecs !== 0) throw new Error("off stays off");
  if (resolveKeepaliveFor("balanced", "linux").intervalSecs !== 3) throw new Error("desktop unchanged");
  if (resolveKeepalive("balanced", "android").intervalSecs !== 10) throw new Error("resolveKeepalive handles platform");
  if (resolveKeepalive("balanced", null).intervalSecs !== 3) throw new Error("null platform unchanged");
});
