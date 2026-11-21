import type { RosVersion } from "./types";

/**
 * Generates a clean MikroTik Hotspot User Profile `on-login` script
 * that schedules automatic user removal after `validity` and optionally locks MAC address.
 * Fixes the legacy Mikbotam bug where `lockMac=true` and `lockMac=false` produced identical scripts.
 */
export function buildHotspotOnLoginScript(params: {
  validity?: string;
  lockMac: boolean;
  rosVersion?: RosVersion;
}): string {
  const validity = (params.validity ?? "").trim();
  const lines: string[] = [];

  if (params.lockMac) {
    lines.push(
      `:local mac $"mac-address"; /ip hotspot user set [find name=$user] mac-address=$mac;`
    );
  }

  if (validity && validity !== "0" && validity !== "00:00:00") {
    const safeValidity = validity.replace(/[^0-9a-zA-Z:]/g, "");
    const policy =
      params.rosVersion === "v7"
        ? "read,write,policy,test"
        : "read,write,policy,test";
    lines.push(
      `:if ([/system scheduler find name=$user] = "") do={`,
      `  /system scheduler add name=$user interval=${safeValidity} policy=${policy} comment="salikurvouch-exp" on-event="/ip hotspot user remove [find name=\\"$user\\"]; /ip hotspot active remove [find user=\\"$user\\"]; /system scheduler remove [find name=\\"$user\\"];"`,
      `}`
    );
  }

  return lines.join("\n");
}

/**
 * Generates a PPP Profile `on-up` script that schedules moving a PPP secret
 * to `expiredProfile` after `validity` duration.
 */
export function buildPppOnUpScript(params: {
  validity?: string;
  expiredProfile?: string;
}): string {
  const validity = (params.validity ?? "").trim();
  const expiredProfile = (params.expiredProfile ?? "").trim();

  if (!validity || !expiredProfile) return "";

  const safeValidity = validity.replace(/[^0-9a-zA-Z:]/g, "");
  const safeProfile = expiredProfile.replace(/["\\]/g, "");

  return [
    `:local uname $user;`,
    `:if ([/system scheduler find name=("ppp-exp-" . $uname)] = "") do={`,
    `  /system scheduler add name=("ppp-exp-" . $uname) interval=${safeValidity} comment="salikurvouch-ppp-exp" on-event="/ppp secret set [find name=\\"$uname\\"] profile=\\"${safeProfile}\\"; /ppp active remove [find name=\\"$uname\\"]; /system scheduler remove [find name=\\"ppp-exp-$uname\\"];"`,
    `}`,
  ].join("\n");
}
