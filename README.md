# GeoWeather Explorer — Lab 06 (OpenStreetMap API & OpenWeather API)

Ứng dụng web tương tác tích hợp đồng thời hệ sinh thái **OpenStreetMap API** (Tile Server qua Leaflet.js, Nominatim Geocoding/Reverse Geocoding API, Overpass POI API) và **OpenWeather API** (Current Weather, 5-Day Forecast, Weather Tile Layers).

## Cách chạy dự án cục bộ (Local)

1. Giải nén thư mục dự án.
2. Mở trực tiếp file `index.html` bằng trình duyệt, **hoặc** chạy local server (khuyến nghị):
   ```bash
   python -m http.server 8000
   ```
   Sau đó truy cập `http://localhost:8000`.
3. Nhấn nút **🔑 API Key** ở góc trên bên phải và dán API Key miễn phí từ [OpenWeatherMap](https://openweathermap.org/api).
   *(Nếu chưa có API Key, ứng dụng tự động chạy chế độ Demo cho phần thời tiết; toàn bộ tính năng bản đồ, tìm kiếm & quét POI của OpenStreetMap vẫn chạy Live 100%.)*

## Cấu trúc thư mục
- `index.html`: Giao diện HTML5 + cấu trúc Sidebar, Bản đồ Leaflet, Modal cấu hình API Key.
- `styles.css`: Styling hiện đại, bố cục responsive (Desktop & Mobile).
- `app.js`: Xử lý gọi API bất đồng bộ (`fetch` + `async/await`), quản lý bản đồ, trạng thái & `localStorage`.
