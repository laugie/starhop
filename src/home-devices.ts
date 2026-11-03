// Home screen devices. topology.json stays the user's own file: the app never
// writes it. Tailscale peers and manual servers are added here as two extra
// regions, so a new user sees their devices without writing any config.
// Pure functions, no DOM and no Tauri calls.

import type { HostEntry, ListHostsResponse } from "./hosts.js";
import type { Presence, TopologyDevice, TopologyRegion, TopologyView } from "./topology.js";
import { t } from "./locales/topology.js";

/** Region names for discovered devices. They follow the topology regions. */
export const DISCOVERED_REGIONS = { tailscale: "Tailscale", manual: t("manualRegion") } as const;

export interface HomeDevices {
  /** The view to draw. The input view itself when nothing was added. */
  view: TopologyView;
  /** Home-screen name of a discovered device -> its host entry, to connect by host. */
  hostByName: Map<string, HostEntry>;
  /** Host entry id -> home-screen name, to mark the active tab's planet. */
  nameByHostId: Map<string, string>;
  /** The view came from a missing topology.json. */
  topologyMissing: boolean;
}

/** `host:port`, or just `host` when ssh picks the port. */
export function deviceAddress(host: string, port: number | null): string {
  return port == null ? host : `${host}:${port}`;
}

/**
 * Add discovered devices to the topology view.
 *
 * - A broken topology.json keeps its error: the user has to see it.
 * - A missing or empty topology.json is replaced by the discovered devices.
 * - A peer that a topology device already points at (host or tailscaleAddress
 *   equal to its IP or name) is left out, so nothing appears twice.
 */
export function mergeDiscovered(view: TopologyView, hosts: ListHostsResponse | null): HomeDevices {
  const result: HomeDevices = {
    view,
    hostByName: new Map(),
    nameByHostId: new Map(),
    topologyMissing: view.state === "missing",
  };
  if (view.state === "error" || !hosts || hosts.hosts.length === 0) {
    return result;
  }
  const base = view.state === "ok" ? view.regions : [];
  const taken = new Set(base.flatMap((region) => region.devices.map((device) => device.name)));
  const known = knownAddresses(base);

  const tailscale: TopologyDevice[] = [];
  const manual: TopologyDevice[] = [];
  for (const host of hosts.hosts) {
    if (host.source !== "manual" && addressesOf(host).some((address) => known.has(address))) {
      continue;
    }
    const name = uniqueName(host.name, host.source === "manual" ? DISCOVERED_REGIONS.manual : DISCOVERED_REGIONS.tailscale, taken);
    taken.add(name);
    result.hostByName.set(name, host);
    result.nameByHostId.set(host.id, name);
    (host.source === "manual" ? manual : tailscale).push(deviceOf(name, host));
  }

  const extra: TopologyRegion[] = [];
  if (tailscale.length > 0) {
    extra.push({ name: DISCOVERED_REGIONS.tailscale, devices: tailscale });
  }
  if (manual.length > 0) {
    extra.push({ name: DISCOVERED_REGIONS.manual, devices: manual });
  }
  if (extra.length === 0) {
    return result;
  }
  const { message: _message, ...rest } = view;
  result.view = { ...rest, state: "ok", regions: [...base, ...extra] };
  return result;
}

function deviceOf(name: string, host: HostEntry): TopologyDevice {
  const os = (host.os ?? "").toLowerCase();
  const mobile = os === "ios" || os === "android";
  const device: TopologyDevice = {
    name,
    host: host.connectTarget,
    port: host.port,
    user: host.user ?? "",
    mobile,
    presence: presenceOf(host),
  };
  const type = mobile ? undefined : TYPE_BY_OS[os];
  if (type) {
    device.type = type;
  }
  return device;
}

const TYPE_BY_OS: Record<string, string> = { macos: "mac", windows: "windows", linux: "server" };

function presenceOf(host: HostEntry): Presence {
  if (host.online === true) {
    return "online";
  }
  if (host.online === false) {
    return "offline";
  }
  return "none";
}

function normalize(address: string): string {
  return address.trim().replace(/\.$/, "").toLowerCase();
}

function knownAddresses(regions: readonly TopologyRegion[]): Set<string> {
  const known = new Set<string>();
  for (const region of regions) {
    for (const device of region.devices) {
      known.add(normalize(device.host));
      if (device.tailscaleAddress) {
        known.add(normalize(device.tailscaleAddress));
      }
    }
  }
  return known;
}

function addressesOf(host: HostEntry): string[] {
  return [host.connectTarget, host.host, host.ip ?? ""].filter((text) => text !== "").map(normalize);
}

function uniqueName(name: string, region: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) {
    return name;
  }
  const tagged = `${name} · ${region}`;
  if (!taken.has(tagged)) {
    return tagged;
  }
  for (let n = 2; ; n += 1) {
    const numbered = `${tagged} ${n}`;
    if (!taken.has(numbered)) {
      return numbered;
    }
  }
}
