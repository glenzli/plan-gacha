import type { NormalizedLocation } from './plan';

export function getLocationSearchText(location?: Partial<NormalizedLocation> | null) {
  if (!location) return '';
  const label = location.label || '';
  const address = location.address || '';
  const weatherLocation = location.weatherLabel || location.weather_label || '';
  return [address, label].filter(Boolean).join(' ') || weatherLocation;
}

export function getLocationCopyText(location?: Partial<NormalizedLocation> | null) {
  if (!location) return '';
  return [location.label, location.address].filter(Boolean).join('\n') || getLocationSearchText(location);
}

export function getGoogleMapsUrl(location?: Partial<NormalizedLocation> | null) {
  const query = getLocationSearchText(location);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

export function getGoogleMapsDirectionsUrl(
  origin?: Partial<NormalizedLocation> | null,
  destination?: Partial<NormalizedLocation> | null,
) {
  const originText = getLocationSearchText(origin);
  const destinationText = getLocationSearchText(destination);
  if (!originText || !destinationText) return '';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}&travelmode=transit`;
}
