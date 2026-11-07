// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Connection } from "@/types";

const connection = {
  id: "c1",
  name: "srv",
  host: "h1",
  port: 22,
  username: "root",
  password: "pw",
  connection_type: "ssh",
  persist_session: false,
} as unknown as Connection;

const sshConnect = vi.hoisted(() => vi.fn(async (_p: Record<string, unknown>) => {}));
const platformMock = vi.hoisted(() => ({ platform: "linux" }));

vi.mock("@/services/ssh", () => ({
  sshConnect,
  sshDisconnect: vi.fn(async () => true),
  sshDisconnectForReconnect: vi.fn(async () => {}),
  sshDetectDistro: vi.fn(async () => null),
  sshSendInput: vi.fn(async () => {}),
}));
vi.mock("@/services/credentials", () => ({
  resolveConnectionCredentials: vi.fn(async () => ({ username: "root", password: "pw" })),
  resolveJumpHosts: vi.fn(async () => []),
}));
vi.mock("@/utils/platform", () => ({
  getPlatform: vi.fn(async () => platformMock.platform),
  getPlatformSync: vi.fn(() => platformMock.platform),
}));
vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: {
    getState: () => ({
      connections: [connection],
      teamConnections: {},
      setLastUsed: vi.fn(async () => {}),
    }),
  },
  connectionToFormData: vi.fn(),
}));
vi.mock("./layoutStore", () => ({
  useLayoutStore: { getState: () => ({ setSplitTabActive: vi.fn() }) },
}));
vi.mock("@/services/hostCommandRun", () => ({ runHostCommand: vi.fn(async () => {}) }));
vi.mock("@/services/auditReporter", () => ({ reportAuditClientEvent: vi.fn() }));
vi.mock("@/services/auditContextResolver", () => ({ auditContextForVaultId: vi.fn(() => ({})) }));

import { useSessionStore } from "./sessionStore";

beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ sessions: [], activeSessionId: null });
});

describe("keepalive resolution on connect", () => {
  test("uses default keepalive (3s / 3) on desktop platforms", async () => {
    platformMock.platform = "linux";
    await useSessionStore.getState().connect("c1");

    expect(sshConnect).toHaveBeenCalledTimes(1);
    const args = sshConnect.mock.calls[0][0];
    expect(args.keepaliveIntervalSecs).toBe(3);
    expect(args.keepaliveMax).toBe(3);
  });

  test("uses Android floor keepalive (10s / 6) on Android", async () => {
    platformMock.platform = "android";
    await useSessionStore.getState().connect("c1");

    expect(sshConnect).toHaveBeenCalledTimes(1);
    const args = sshConnect.mock.calls[0][0];
    expect(args.keepaliveIntervalSecs).toBe(10);
    expect(args.keepaliveMax).toBe(6);
  });
});
