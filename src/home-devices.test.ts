// Home screen: devices found through Tailscale and manual servers appear next to
// topology.json devices, without the app ever writing topology.json.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HostEntry, ListHostsResponse } from "./hosts.js";
import type { TopologyView } from "./topology.js";
import { DISCOVERED_REGIONS, deviceAddress, mergeDiscovered } from "./home-devices.js";

function peer(over: Partial<HostEntry> & { id: string; name: string }): HostEntry {
  return {
    host: `${over.name}.example.ts.net`,
    ip: null,
    online: true,
    os: "linux",
    user: null,
    port: null,
    source: "tailscale",
    connectTarget: `${over.name}.example.ts.net`,
    ...over,
  };
}

function hosts(list: HostEntry[], status: ListHostsResponse["status"] = "ok"): ListHostsResponse {
  return { status, hosts: list };
}

const topology: TopologyView = {
  configPath: "/cfg/topology.json",
  state: "ok",
  regions: [
    {
      name: "Office",
      devices: [
        { name: "nas", host: "192.0.2.5", port: 22, user: "admin", mobile: false, presence: "unknown", tailscaleAddress: "100.64.0.5" },
        { name: "app", host: "app.example.com", port: 2222, user: "me", mobile: false, presence: "unknown" },
      ],
    },
  ],
};

test("Tailscale peers and manual servers become two extra regions after the topology", () => {
  const merged = mergeDiscovered(
    topology,
    hosts([
      peer({ id: "ts-1", name: "laptop", os: "macOS", online: false }),
      peer({ id: "ts-2", name: "phone", os: "iOS" }),
      {
        id: "manual-1",
        name: "lab",
        host: "198.51.100.7",
        ip: "198.51.100.7",
        online: null,
        os: null,
        user: "ops",
        port: 2200,
        source: "manual",
        connectTarget: "198.51.100.7",
      },
    ]),
  );
  assert.deepEqual(
    merged.view.regions.map((region) => region.name),
    ["Office", DISCOVERED_REGIONS.tailscale, DISCOVERED_REGIONS.manual],
  );
  const tailscale = merged.view.regions[1]!.devices;
  assert.deepEqual(
    tailscale.map((d) => [d.name, d.host, d.port, d.type, d.mobile, d.presence]),
    [
      ["laptop", "laptop.example.ts.net", null, "mac", false, "offline"],
      ["phone", "phone.example.ts.net", null, undefined, true, "online"],
    ],
  );
  const manual = merged.view.regions[2]!.devices;
  assert.deepEqual(manual.map((d) => [d.name, d.host, d.port, d.user, d.presence]), [
    ["lab", "198.51.100.7", 2200, "ops", "none"],
  ]);
  assert.equal(merged.hostByName.get("laptop")?.id, "ts-1");
  assert.equal(merged.nameByHostId.get("manual-1"), "lab");
  assert.equal(merged.hostByName.has("nas"), false, "topology devices are not host entries");
});

test("a peer already in topology.json is not shown twice", () => {
  const merged = mergeDiscovered(
    topology,
    hosts([
      peer({ id: "ts-a", name: "office-nas", ip: "100.64.0.5", connectTarget: "office-nas.example.ts.net" }),
      peer({ id: "ts-b", name: "web", ip: "100.64.0.9", connectTarget: "APP.example.com." }),
      peer({ id: "ts-c", name: "other", ip: "100.64.0.10" }),
    ]),
  );
  const names = merged.view.regions.flatMap((region) => region.devices.map((d) => d.name));
  assert.deepEqual(names, ["nas", "app", "other"]);
});

test("a discovered name that clashes with a topology device gets a suffix", () => {
  const merged = mergeDiscovered(topology, hosts([peer({ id: "ts-x", name: "app", ip: "100.64.0.20" })]));
  const extra = merged.view.regions[1]!.devices[0]!;
  assert.equal(extra.name, "app · Tailscale");
  assert.equal(merged.hostByName.get("app · Tailscale")?.id, "ts-x");
  assert.equal(merged.hostByName.has("app"), false);
});

test("without topology.json the discovered devices fill the home screen", () => {
  for (const state of ["missing", "empty"] as const) {
    const base: TopologyView = { configPath: "/cfg/topology.json", state, message: "x", regions: [] };
    const merged = mergeDiscovered(base, hosts([peer({ id: "ts-1", name: "box" })]));
    assert.equal(merged.view.state, "ok", state);
    assert.equal(merged.view.message, undefined);
    assert.deepEqual(merged.view.regions.map((r) => r.name), [DISCOVERED_REGIONS.tailscale]);
    assert.equal(merged.topologyMissing, state === "missing");
  }
});

test("nothing discovered leaves the view as it was", () => {
  const base: TopologyView = { configPath: "/cfg/topology.json", state: "missing", message: "x", regions: [] };
  assert.equal(mergeDiscovered(base, hosts([], "not_installed")).view, base);
  assert.equal(mergeDiscovered(base, null).view, base);
  assert.equal(mergeDiscovered(topology, hosts([])).view, topology);
});

test("a broken topology.json still shows its error", () => {
  const base: TopologyView = { configPath: "/cfg/topology.json", state: "error", message: "bad", regions: [] };
  const merged = mergeDiscovered(base, hosts([peer({ id: "ts-1", name: "box" })]));
  assert.equal(merged.view, base);
});

test("a server both on Tailscale and added by hand is listed once, under Tailscale", () => {
  const merged = mergeDiscovered(
    { configPath: "", state: "missing", regions: [] },
    hosts([peer({ id: "ts-1", name: "box", source: "tailscale+manual", user: "me", port: 22 })]),
  );
  assert.deepEqual(merged.view.regions.map((r) => [r.name, r.devices.length]), [[DISCOVERED_REGIONS.tailscale, 1]]);
  assert.equal(merged.view.regions[0]!.devices[0]!.user, "me");
});

test("address shows the port only when there is one", () => {
  assert.equal(deviceAddress("host-a", 2222), "host-a:2222");
  assert.equal(deviceAddress("host-a", null), "host-a");
});
