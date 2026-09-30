import "server-only";
import { distanceMeters } from "@/lib/utils/geo";

/*
 * Live reverse geocoding and nearby landmarks from OpenStreetMap's free APIs:
 *   Nominatim (address)   https://nominatim.openstreetmap.org
 *   Overpass  (landmark)  https://overpass-api.de
 * No API key and no cost. Calls run on this server (never from the browser),
 * with an identifying User-Agent, max 1 Nominatim request/second and a
 * short-lived cache, per the OSM usage policies. The employee's coordinates
 * for that one punch are sent to OpenStreetMap — the check-in screen says so.
 *
 * For higher volume, point GTF_NOMINATIM_URL / GTF_OVERPASS_URL at a
 * self-hosted instance (same APIs, still free software). GTF_GEOCODER=off
 * disables all external lookups.
 */

const NOMINATIM = (process.env.GTF_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const OVERPASS = process.env.GTF_OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const ENABLED = process.env.GTF_GEOCODER !== "off";
const USER_AGENT = process.env.GTF_GEOCODER_USER_AGENT ?? "GTF-HR/0.1 (internal HR attendance; server-side, low volume)";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/* Nominatim allows at most 1 request per second: serialize calls. */
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + 1_100 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

/* ~11 m grid, 12 h — repeated check-ins at the same desk reuse the answer. */
const TTL = 12 * 3_600_000;
const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    if (cache.size > 5_000) cache.delete(cache.keys().next().value ?? "");
    cache.set(key, { at: Date.now(), value });
    return value;
  });
}

async function getJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en-IN,en", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

type Point = { latitude: number; longitude: number };
const key = (kind: string, point: Point) => `${kind}:${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;

interface NominatimAddress {
  [part: string]: string | undefined;
}

/** Short readable address, e.g. "Film City Road, Sector 16A, Noida, Uttar Pradesh 201301". */
function shortAddress(address: NominatimAddress, fallback: string): string {
  const pick = (...keys: string[]) => keys.map((k) => address[k]).find(Boolean);
  const parts = [
    pick("amenity", "building", "office", "shop"),
    pick("road", "pedestrian", "footway"),
    pick("neighbourhood", "suburb", "quarter", "hamlet", "residential"),
    pick("city", "town", "village", "municipality", "county", "state_district"),
    [pick("state"), pick("postcode")].filter(Boolean).join(" ") || undefined,
  ];
  const unique = parts.filter((part, index): part is string => Boolean(part) && parts.indexOf(part) === index);
  return unique.length ? unique.join(", ") : fallback;
}

/** Live reverse geocode. Null when disabled, unreachable or nothing is known there. */
export async function reverseGeocode(point: Point): Promise<string | null> {
  if (!ENABLED) return null;
  try {
    return await cached(key("rev", point), () =>
      throttled(async () => {
        const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${point.latitude}&lon=${point.longitude}`;
        const json = (await getJson(url, {}, 6_000)) as { display_name?: string; address?: NominatimAddress; error?: string };
        if (json.error || !json.address) return null;
        return shortAddress(json.address, json.display_name ?? "");
      }),
    );
  } catch {
    return null;
  }
}

export interface NearbyPlace {
  name: string;
  category: string;
  distanceMeters: number;
}

function category(tags: Record<string, string | undefined>): string {
  if (tags.station === "subway") return "metro";
  if (tags.railway) return "railway";
  if (tags.shop === "mall") return "mall";
  if (tags.leisure === "park") return "park";
  return tags.amenity ?? "place";
}

/** Live nearest named landmark within 400 m (Overpass). Null on poor accuracy or failure. */
export async function nearestLandmark(point: Point & { accuracy: number }): Promise<NearbyPlace | null> {
  if (!ENABLED || point.accuracy > 150) return null;
  try {
    return await cached(key("poi", point), async () => {
      const at = `(around:400,${point.latitude},${point.longitude})`;
      const data = `[out:json][timeout:8];(
nwr${at}["name"]["amenity"~"^(school|kindergarten|college|university|hospital|clinic|bank|place_of_worship|police|post_office|bus_station|townhall)$"];
nwr${at}["name"]["railway"~"^(station|halt)$"];
nwr${at}["name"]["station"="subway"];
nwr${at}["name"]["shop"="mall"];
nwr${at}["name"]["leisure"="park"];
);out center 40;`;
      const json = (await getJson(OVERPASS, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data }).toString() }, 9_000)) as {
        elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string | undefined> }[];
      };
      let best: NearbyPlace | null = null;
      for (const element of json.elements ?? []) {
        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        const name = element.tags?.["name:en"] ?? element.tags?.name;
        if (lat === undefined || lon === undefined || !name) continue;
        const meters = distanceMeters(point, { latitude: lat, longitude: lon });
        if (!best || meters < best.distanceMeters) best = { name, category: category(element.tags ?? {}), distanceMeters: meters };
      }
      return best;
    });
  } catch {
    return null;
  }
}

export interface AddressMatch {
  label: string;
  latitude: number;
  longitude: number;
}

/** Forward search for HR adding an office site ("Sector 62 Noida"). */
export async function searchAddress(query: string): Promise<AddressMatch[]> {
  if (!ENABLED) throw new Error("Address search is turned off (GTF_GEOCODER=off).");
  return cached(`search:${query.toLowerCase()}`, () =>
    throttled(async () => {
      const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(query)}`;
      const json = (await getJson(url, {}, 8_000)) as { display_name?: string; lat?: string; lon?: string }[];
      return (Array.isArray(json) ? json : []).flatMap((item) =>
        item.display_name && item.lat && item.lon ? [{ label: item.display_name, latitude: Number(Number(item.lat).toFixed(6)), longitude: Number(Number(item.lon).toFixed(6)) }] : [],
      );
    }),
  );
}
