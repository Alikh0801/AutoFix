import * as Location from 'expo-location';

export interface UserLocation {
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
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
