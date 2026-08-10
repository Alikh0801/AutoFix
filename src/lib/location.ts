import * as Location from 'expo-location';

export interface UserLocation {
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
}

/** Great-circle distance in km between two lat/lng points. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough ETA in minutes for a road distance, assuming ~28 km/h in-city. */
export function etaMinutes(km: number): number {
  return Math.max(1, Math.round((km / 28) * 60));
}

export class LocationPermissionError extends Error {
  constructor() {
    super('Lokasiya icazəsi verilmədi');
    this.name = 'LocationPermissionError';
  }
}

function buildAddress(g: Location.LocationGeocodedAddress): string | null {
  // Prefer "street + number", fall back to name / district.
  const line = [g.street, g.streetNumber].filter(Boolean).join(' ');
  return line || g.name || g.district || g.city || null;
}

/** Ask for permission, get the current position, and reverse-geocode it. */
export async function getCurrentLocation(): Promise<UserLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationPermissionError();

  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude, longitude } = pos.coords;

  let address: string | null = null;
  let city: string | null = null;
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const g = results[0];
    if (g) {
      address = buildAddress(g);
      city = g.city ?? g.subregion ?? g.region ?? null;
    }
  } catch {
    // reverse geocoding is best-effort; coordinates are what matter
  }

  return { lat: latitude, lng: longitude, address, city };
}
