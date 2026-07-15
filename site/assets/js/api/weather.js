const weatherCache = new Map();
const MAX_FORECAST_DAYS = 14;

export function loadVenueWeather(venue, kickoffAt) {
  if (!venue || !kickoffAt) return Promise.resolve({ status: "unavailable" });
  const kickoff = new Date(kickoffAt);
  const days = (kickoff - new Date()) / 86400000;
  if (days < 0 || days > MAX_FORECAST_DAYS) return Promise.resolve({ status: "outside-range" });
  const key = `${venue}\u0000${kickoffAt}`;
  if (!weatherCache.has(key)) weatherCache.set(key, fetchWeather(venue, kickoffAt));
  return weatherCache.get(key);
}

async function fetchWeather(venue, kickoffAt) {
  try {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.search = new URLSearchParams({ name: venue, count: "1", language: "ja", format: "json", countryCode: "JP" });
    const geocodeResponse = await fetch(geocodeUrl, { cache: "force-cache" });
    if (!geocodeResponse.ok) return { status: "unavailable" };
    const location = (await geocodeResponse.json()).results?.[0];
    if (!location) return { status: "unavailable" };

    const day = kickoffAt.slice(0, 10);
    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), hourly: "temperature_2m,weather_code,precipitation_probability", timezone: "Asia/Tokyo", start_date: day, end_date: day });
    const response = await fetch(forecastUrl, { cache: "force-cache" });
    if (!response.ok) return { status: "unavailable" };
    const data = await response.json();
    const targetHour = `${day}T${kickoffAt.slice(11, 13)}:00`;
    const index = data.hourly?.time?.indexOf(targetHour) ?? -1;
    if (index < 0) return { status: "unavailable" };
    return {
      status: "ready",
      temperature: data.hourly.temperature_2m?.[index],
      precipitationProbability: data.hourly.precipitation_probability?.[index],
      weatherCode: data.hourly.weather_code?.[index],
      locationName: location.name,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function weatherLabel(code) {
  if (code === 0) return "快晴";
  if ([1, 2].includes(code)) return "晴れ時々曇り";
  if (code === 3) return "曇り";
  if ([45, 48].includes(code)) return "霧";
  if ([51, 53, 55, 56, 57].includes(code)) return "霧雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天気情報あり";
}
