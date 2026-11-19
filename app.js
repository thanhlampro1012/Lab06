/**
 * GeoWeather Explorer — Core Application Logic
 * Tích hợp:
 *  1. OpenStreetMap Tile Layer (Leaflet.js)
 *  2. OpenStreetMap Nominatim API (Forward & Reverse Geocoding)
 *  3. OpenStreetMap Overpass API (Nearby Points of Interest - POI)
 *  4. OpenWeatherMap Current Weather & 5-Day/3-Hour Forecast API
 */

// =========================================================
// 1. Trạng thái ứng dụng (Application State)
// =========================================================
const DEFAULT_COORDS = { lat: 10.7769, lon: 106.7009, name: "TP. Hồ Chí Minh, Việt Nam" };

const state = {
  apiKey: localStorage.getItem("owm_api_key") || "",
  unit: localStorage.getItem("temp_unit") || "metric", // "metric" (°C) | "imperial" (°F)
  currentLocation: { ...DEFAULT_COORDS, address: "Quận 1, Thành phố Hồ Chí Minh, Việt Nam" },
  favorites: JSON.parse(localStorage.getItem("saved_locations") || "[]"),
};

// =========================================================
// 2. Khởi tạo bản đồ OpenStreetMap với Leaflet.js
// =========================================================
const map = L.map("map").setView([DEFAULT_COORDS.lat, DEFAULT_COORDS.lon], 13);

// Lớp bản đồ nền OpenStreetMap tiêu chuẩn
const osmStandardLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

// Lớp bản đồ địa hình OpenTopoMap (thuộc hệ sinh thái OSM)
const osmTopoLayer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; OpenTopoMap',
});

osmStandardLayer.addTo(map);

// Quản lý lớp bản đồ (Layer Control)
const baseLayers = {
  "OpenStreetMap (Tiêu chuẩn)": osmStandardLayer,
  "OpenTopoMap (Địa hình)": osmTopoLayer,
};
let layerControl = L.control.layers(baseLayers, {}).addTo(map);
let weatherOverlayLayers = [];

// Marker vị trí đang chọn và nhóm marker POI lân cận
let activeMarker = L.marker([DEFAULT_COORDS.lat, DEFAULT_COORDS.lon]).addTo(map);
const poiLayerGroup = L.layerGroup().addTo(map);

// =========================================================
// 3. Tham chiếu phần tử DOM
// =========================================================
const dom = {
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  locateBtn: document.getElementById("locate-btn"),
  unitToggle: document.getElementById("unit-toggle"),
  settingsBtn: document.getElementById("settings-btn"),
  demoBanner: document.getElementById("demo-banner"),
  bannerKeyBtn: document.getElementById("banner-key-btn"),

  placeName: document.getElementById("place-name"),
  placeAddress: document.getElementById("place-address"),
  placeCoords: document.getElementById("place-coords"),
  weatherIcon: document.getElementById("weather-icon"),
  weatherTemp: document.getElementById("weather-temp"),
  weatherDesc: document.getElementById("weather-desc"),
  metricFeels: document.getElementById("metric-feels"),
  metricHumidity: document.getElementById("metric-humidity"),
  metricWind: document.getElementById("metric-wind"),
  metricPressure: document.getElementById("metric-pressure"),
  weatherLoading: document.getElementById("weather-loading"),
  weatherError: document.getElementById("weather-error"),
  forecastList: document.getElementById("forecast-list"),

  poiCategory: document.getElementById("poi-category"),
  findPoiBtn: document.getElementById("find-poi-btn"),
  poiStatus: document.getElementById("poi-status"),
  poiList: document.getElementById("poi-list"),

  saveFavBtn: document.getElementById("save-fav-btn"),
  favoritesList: document.getElementById("favorites-list"),

  apiModal: document.getElementById("api-modal"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  apiKeyInput: document.getElementById("api-key-input"),
  saveKeyBtn: document.getElementById("save-key-btn"),
  clearKeyBtn: document.getElementById("clear-key-btn"),
};

// =========================================================
// 4. Tích hợp OpenStreetMap Nominatim API (Geocoding)
// =========================================================

/**
 * Forward Geocoding: Chuyển tên địa điểm -> Tọa độ (lat, lon)
 */
async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
  const response = await fetch(url, {
    headers: { "Accept-Language": "vi,en" },
  });
  if (!response.ok) throw new Error("Không thể kết nối tới Nominatim API.");
  const results = await response.json();
  if (!results.length) throw new Error(`Không tìm thấy địa điểm "${query}".`);

  const item = results[0];
  return {
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    name: item.name || query,
    address: item.display_name,
  };
}

/**
 * Reverse Geocoding: Chuyển tọa độ (lat, lon) -> Địa chỉ chi tiết
 */
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
  try {
    const response = await fetch(url, {
      headers: { "Accept-Language": "vi,en" },
    });
    if (!response.ok) throw new Error("Reverse geocode error");
    const data = await response.json();
    const addr = data.address || {};
    const shortName =
      addr.city || addr.town || addr.village || addr.suburb || addr.county || addr.state || "Vị trí đã chọn";
    return {
      name: shortName,
      address: data.display_name || `Tọa độ ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    };
  } catch {
    return {
      name: "Vị trí trên bản đồ",
      address: `Tọa độ ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    };
  }
}

// =========================================================
// 5. Tích hợp OpenStreetMap Overpass API (Tìm POI lân cận)
// =========================================================
async function fetchNearbyPOIs(lat, lon, category) {
  const radius = 1500; // bán kính 1.5km
  const tagKey = category === "park" ? "leisure" : "amenity";
  const overpassQuery = `
    [out:json][timeout:15];
    (
      node["${tagKey}"="${category}"](around:${radius},${lat},${lon});
      way["${tagKey}"="${category}"](around:${radius},${lat},${lon});
    );
    out center 15;
  `;

  dom.poiStatus.textContent = "Đang truy vấn OpenStreetMap Overpass API...";
  dom.poiStatus.classList.remove("hidden");
  dom.poiList.innerHTML = "";
  poiLayerGroup.clearLayers();

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(overpassQuery)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.ok) throw new Error("Overpass API đang bận, vui lòng thử lại sau.");
    const data = await response.json();
    const elements = (data.elements || []).filter((el) => el.tags && el.tags.name);

    dom.poiStatus.classList.add("hidden");

    if (!elements.length) {
      dom.poiList.innerHTML = `<li class="muted">Không tìm thấy địa điểm có tên trong bán kính 1.5km.</li>`;
      return;
    }

    elements.slice(0, 12).forEach((el) => {
      const pLat = el.lat || (el.center && el.center.lat);
      const pLon = el.lon || (el.center && el.center.lon);
      if (!pLat || !pLon) return;

      const poiName = el.tags.name;
      const street = el.tags["addr:street"] ? ` — ${el.tags["addr:street"]}` : "";

      // Vẽ CircleMarker màu nổi bật cho POI trên bản đồ OSM
      const marker = L.circleMarker([pLat, pLon], {
        radius: 7,
        fillColor: "#0ea5e9",
        color: "#1e3a8a",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      })
        .bindPopup(`<strong>${poiName}</strong><br/><small>Loại: ${category}${street}</small>`)
        .addTo(poiLayerGroup);

      // Hiển thị trong danh sách Sidebar
      const li = document.createElement("li");
      li.className = "poi-item";
      li.innerHTML = `<span><strong>${poiName}</strong><br/><small class="muted">${street || "OpenStreetMap POI"}</small></span><span>📍</span>`;
      li.addEventListener("click", () => {
        map.flyTo([pLat, pLon], 16);
        marker.openPopup();
      });
      dom.poiList.appendChild(li);
    });
  } catch (err) {
    dom.poiStatus.classList.add("hidden");
    dom.poiList.innerHTML = `<li class="error-msg">${err.message}</li>`;
  }
}

// =========================================================
// 6. Tích hợp OpenWeather API (Current Weather + 5-Day Forecast)
// =========================================================

/**
 * Cập nhật lớp phủ thời tiết OpenWeather (Clouds / Precipitation) lên bản đồ OSM
 */
function setupWeatherOverlays() {
  // Gỡ các overlay cũ nếu có
  weatherOverlayLayers.forEach((layer) => {
    map.removeLayer(layer);
    layerControl.removeLayer(layer);
  });
  weatherOverlayLayers = [];

  if (!state.apiKey) return;

  const cloudsLayer = L.tileLayer(
    `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${state.apiKey}`,
    { opacity: 0.55, attribution: "Weather &copy; OpenWeatherMap" }
  );
  const precipLayer = L.tileLayer(
    `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${state.apiKey}`,
    { opacity: 0.6, attribution: "Weather &copy; OpenWeatherMap" }
  );

  layerControl.addOverlay(cloudsLayer, "☁️ Lớp mây (OpenWeather)");
  layerControl.addOverlay(precipLayer, "🌧️ Lớp lượng mưa (OpenWeather)");
  weatherOverlayLayers.push(cloudsLayer, precipLayer);
}

/**
 * Dữ liệu mô phỏng (Demo Mode) khi sinh viên chưa dán OpenWeather API Key
 */
function buildMockWeather(lat, lon) {
  const seed = Math.abs(Math.round((lat + lon) * 10)) % 10;
  const baseTempC = 22 + seed; // 22°C - 31°C
  const isMetric = state.unit === "metric";
  const convert = (c) => (isMetric ? c : Math.round((c * 9) / 5 + 32));

  const current = {
    main: {
      temp: convert(baseTempC),
      feels_like: convert(baseTempC + 2),
      humidity: 60 + (seed % 25),
      pressure: 1008 + seed,
    },
    wind: { speed: isMetric ? 3.4 : 7.6 },
    weather: [{ description: "trời quang có mây nhẹ (Demo)", icon: "02d" }],
  };

  const forecastList = [];
  const icons = ["01d", "02d", "03d", "10d", "02d"];
  const descs = ["Nắng nhẹ", "Ít mây", "Nhiều mây", "Mưa rào nhẹ", "Nắng ấm"];
  const now = Date.now();

  for (let i = 1; i <= 5; i++) {
    const dt = Math.floor((now + i * 86400000) / 1000);
    forecastList.push({
      dt,
      main: { temp: convert(baseTempC + (i % 3) - 1) },
      weather: [{ description: descs[i - 1], icon: icons[i - 1] }],
    });
  }

  return { current, forecastList };
}

/**
 * Gọi đồng thời Current Weather API & 5-Day Forecast API của OpenWeather
 */
async function fetchWeatherData(lat, lon) {
  dom.weatherLoading.classList.remove("hidden");
  dom.weatherError.classList.add("hidden");

  // Nếu chưa có API Key -> Dùng Demo Mode nhưng vẫn hiển thị banner hướng dẫn
  if (!state.apiKey) {
    dom.demoBanner.classList.remove("hidden");
    const mock = buildMockWeather(lat, lon);
    renderWeather(mock.current);
    renderForecast(mock.forecastList);
    dom.weatherLoading.classList.add("hidden");
    return;
  }

  dom.demoBanner.classList.add("hidden");

  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${state.unit}&lang=vi&appid=${state.apiKey}`;
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${state.unit}&lang=vi&appid=${state.apiKey}`;

  try {
    const [curRes, forRes] = await Promise.all([fetch(currentUrl), fetch(forecastUrl)]);

    if (curRes.status === 401 || forRes.status === 401) {
      throw new Error("OpenWeather API Key không hợp lệ hoặc chưa được kích hoạt (có thể mất 10-30 phút sau khi tạo).");
    }
    if (!curRes.ok || !forRes.ok) {
      throw new Error("Không thể tải dữ liệu từ OpenWeather API.");
    }

    const currentData = await curRes.json();
    const forecastData = await forRes.json();

    // Lọc lấy 1 mốc đại diện mỗi ngày (khoảng 12:00 trưa) cho dự báo 5 ngày
    const dailyItems = forecastData.list.filter((item) => item.dt_txt.includes("12:00:00")).slice(0, 5);
    const fallbackItems = dailyItems.length ? dailyItems : forecastData.list.filter((_, idx) => idx % 8 === 0).slice(0, 5);

    renderWeather(currentData);
    renderForecast(fallbackItems);
  } catch (err) {
    dom.weatherError.textContent = err.message;
    dom.weatherError.classList.remove("hidden");
  } finally {
    dom.weatherLoading.classList.add("hidden");
  }
}

// =========================================================
// 7. Hiển thị dữ liệu lên giao diện (UI Rendering)
// =========================================================
function renderWeather(data) {
  const unitSymbol = state.unit === "metric" ? "°C" : "°F";
  const windUnit = state.unit === "metric" ? "m/s" : "mph";

  const iconCode = data.weather[0].icon;
  dom.weatherIcon.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  dom.weatherTemp.textContent = `${Math.round(data.main.temp)}${unitSymbol}`;
  dom.weatherDesc.textContent = data.weather[0].description;

  dom.metricFeels.textContent = `${Math.round(data.main.feels_like)}${unitSymbol}`;
  dom.metricHumidity.textContent = `${data.main.humidity}%`;
  dom.metricWind.textContent = `${data.wind.speed} ${windUnit}`;
  dom.metricPressure.textContent = `${data.main.pressure} hPa`;

  // Cập nhật Popup trên Marker OpenStreetMap
  activeMarker
    .bindPopup(
      `<strong>${state.currentLocation.name}</strong><br/>
       ${Math.round(data.main.temp)}${unitSymbol} — ${data.weather[0].description}<br/>
       Độ ẩm: ${data.main.humidity}% | Gió: ${data.wind.speed} ${windUnit}`
    )
    .openPopup();
}

function renderForecast(items) {
  const unitSymbol = state.unit === "metric" ? "°C" : "°F";
  dom.forecastList.innerHTML = "";

  items.forEach((item) => {
    const date = new Date(item.dt * 1000);
    const dayStr = date.toLocaleDateString("vi-VN", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });

    const div = document.createElement("div");
    div.className = "forecast-item";
    div.innerHTML = `
      <div class="forecast-left">
        <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png" alt="icon" />
        <div>
          <strong>${dayStr}</strong>
          <div class="muted">${item.weather[0].description}</div>
        </div>
      </div>
      <strong>${Math.round(item.main.temp)}${unitSymbol}</strong>
    `;
    dom.forecastList.appendChild(div);
  });
}

function renderFavorites() {
  dom.favoritesList.innerHTML = "";
  if (!state.favorites.length) {
    dom.favoritesList.innerHTML = `<li class="muted">Chưa có địa điểm yêu thích nào.</li>`;
    return;
  }

  state.favorites.forEach((fav, idx) => {
    const li = document.createElement("li");
    li.className = "fav-item";
    li.innerHTML = `
      <span>⭐ <strong>${fav.name}</strong></span>
      <button class="delete-fav" title="Xóa" data-index="${idx}">✕</button>
    `;
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-fav")) {
        state.favorites.splice(idx, 1);
        localStorage.setItem("saved_locations", JSON.stringify(state.favorites));
        renderFavorites();
        return;
      }
      selectLocation(fav.lat, fav.lon, fav.name, fav.address);
    });
    dom.favoritesList.appendChild(li);
  });
}

// =========================================================
// 8. Luồng điều phối trung tâm khi chọn địa điểm
// =========================================================
async function selectLocation(lat, lon, name = null, address = null) {
  let locName = name;
  let locAddress = address;

  if (!locName || !locAddress) {
    const rev = await reverseGeocode(lat, lon);
    locName = locName || rev.name;
    locAddress = locAddress || rev.address;
  }

  state.currentLocation = { lat, lon, name: locName, address: locAddress };

  // Cập nhật thông tin địa điểm
  dom.placeName.textContent = locName;
  dom.placeAddress.textContent = locAddress;
  dom.placeCoords.textContent = `Lat: ${lat.toFixed(4)} | Lon: ${lon.toFixed(4)}`;

  // Di chuyển bản đồ & marker
  map.flyTo([lat, lon], 13, { duration: 0.8 });
  activeMarker.setLatLng([lat, lon]);
  poiLayerGroup.clearLayers();
  dom.poiList.innerHTML = `<li class="muted">Nhấn "Tìm bán kính 1.5km" để quét tiện ích xung quanh vị trí mới.</li>`;

  // Gọi OpenWeather API
  await fetchWeatherData(lat, lon);
}

// =========================================================
// 9. Sự kiện tương tác người dùng (Event Listeners)
// =========================================================

// Click trực tiếp trên bản đồ OpenStreetMap
map.on("click", (e) => {
  const { lat, lng } = e.latlng;
  selectLocation(lat, lng);
});

// Tìm kiếm địa điểm bằng Nominatim API
dom.searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = dom.searchInput.value.trim();
  if (!query) return;
  try {
    const loc = await geocodeAddress(query);
    await selectLocation(loc.lat, loc.lon, loc.name, loc.address);
  } catch (err) {
    alert(err.message);
  }
});

// Nút chọn nhanh thành phố
document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const city = btn.dataset.city;
    dom.searchInput.value = city;
    try {
      const loc = await geocodeAddress(city);
      await selectLocation(loc.lat, loc.lon, loc.name, loc.address);
    } catch (err) {
      alert(err.message);
    }
  });
});

// Định vị vị trí hiện tại (HTML5 Geolocation API)
dom.locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Trình duyệt không hỗ trợ Geolocation.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => selectLocation(pos.coords.latitude, pos.coords.longitude),
    () => alert("Không thể truy cập vị trí hiện tại. Vui lòng cấp quyền định vị cho trình duyệt.")
  );
});

// Chuyển đổi đơn vị °C / °F
dom.unitToggle.addEventListener("click", () => {
  state.unit = state.unit === "metric" ? "imperial" : "metric";
  localStorage.setItem("temp_unit", state.unit);
  dom.unitToggle.textContent = state.unit === "metric" ? "Đơn vị: °C" : "Đơn vị: °F";
  fetchWeatherData(state.currentLocation.lat, state.currentLocation.lon);
});

// Tìm tiện ích lân cận (Overpass API)
dom.findPoiBtn.addEventListener("click", () => {
  const { lat, lon } = state.currentLocation;
  fetchNearbyPOIs(lat, lon, dom.poiCategory.value);
});

// Lưu địa điểm yêu thích
dom.saveFavBtn.addEventListener("click", () => {
  const exists = state.favorites.some(
    (f) => Math.abs(f.lat - state.currentLocation.lat) < 0.001 && Math.abs(f.lon - state.currentLocation.lon) < 0.001
  );
  if (!exists) {
    state.favorites.unshift({ ...state.currentLocation });
    localStorage.setItem("saved_locations", JSON.stringify(state.favorites));
    renderFavorites();
  }
});

// Modal cấu hình API Key
const openModal = () => {
  dom.apiKeyInput.value = state.apiKey;
  dom.apiModal.classList.remove("hidden");
};
const closeModal = () => dom.apiModal.classList.add("hidden");

dom.settingsBtn.addEventListener("click", openModal);
dom.bannerKeyBtn.addEventListener("click", openModal);
dom.closeModalBtn.addEventListener("click", closeModal);

dom.saveKeyBtn.addEventListener("click", () => {
  state.apiKey = dom.apiKeyInput.value.trim();
  localStorage.setItem("owm_api_key", state.apiKey);
  closeModal();
  setupWeatherOverlays();
  fetchWeatherData(state.currentLocation.lat, state.currentLocation.lon);
});

dom.clearKeyBtn.addEventListener("click", () => {
  state.apiKey = "";
  localStorage.removeItem("owm_api_key");
  closeModal();
  setupWeatherOverlays();
  fetchWeatherData(state.currentLocation.lat, state.currentLocation.lon);
});

// =========================================================
// 10. Khởi chạy ứng dụng lần đầu
// =========================================================
(function initApp() {
  dom.unitToggle.textContent = state.unit === "metric" ? "Đơn vị: °C" : "Đơn vị: °F";
  renderFavorites();
  setupWeatherOverlays();
  selectLocation(
    DEFAULT_COORDS.lat,
    DEFAULT_COORDS.lon,
    DEFAULT_COORDS.name,
    state.currentLocation.address
  );
})();
