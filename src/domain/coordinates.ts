export interface MapPoint {
  longitude: number;
  latitude: number;
  coordinateSystem: 'GCJ-02' | 'WGS84';
}

const PI = Math.PI;
const AXIS = 6378245;
const ECCENTRICITY = 0.006693421622965943;

function latitudeOffset(longitude: number, latitude: number) {
  let offset = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude * latitude
    + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude));
  offset += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3;
  offset += (20 * Math.sin(latitude * PI) + 40 * Math.sin(latitude / 3 * PI)) * 2 / 3;
  return offset + (160 * Math.sin(latitude / 12 * PI) + 320 * Math.sin(latitude * PI / 30)) * 2 / 3;
}

function longitudeOffset(longitude: number, latitude: number) {
  let offset = 300 + longitude + 2 * latitude + 0.1 * longitude * longitude
    + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude));
  offset += (20 * Math.sin(6 * longitude * PI) + 20 * Math.sin(2 * longitude * PI)) * 2 / 3;
  offset += (20 * Math.sin(longitude * PI) + 40 * Math.sin(longitude / 3 * PI)) * 2 / 3;
  return offset + (150 * Math.sin(longitude / 12 * PI) + 300 * Math.sin(longitude / 30 * PI)) * 2 / 3;
}

// A local approximation for explicit GPS place points. Never apply it to weather-area coordinates.
export function wgs84ToGcj02(point: MapPoint): MapPoint | null {
  if (point.coordinateSystem === 'GCJ-02') return point;
  if (point.coordinateSystem !== 'WGS84') return null;
  const { longitude, latitude } = point;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) return null;

  const adjustedLatitude = latitudeOffset(longitude - 105, latitude - 35);
  const adjustedLongitude = longitudeOffset(longitude - 105, latitude - 35);
  const latitudeRadians = latitude / 180 * PI;
  const sine = Math.sin(latitudeRadians);
  const magic = 1 - ECCENTRICITY * sine * sine;
  const root = Math.sqrt(magic);
  return {
    longitude: longitude + adjustedLongitude * 180 / (AXIS / root * Math.cos(latitudeRadians) * PI),
    latitude: latitude + adjustedLatitude * 180 / ((AXIS * (1 - ECCENTRICITY)) / (magic * root) * PI),
    coordinateSystem: 'GCJ-02',
  };
}
