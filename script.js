const app = {
    // --- 1. CONFIGURATION & STATE ---
    config: {
        stations: [
            { id: 0, name: "Stasiun Dumai Kota", coords: [1.685167, 101.4785] },
            { id: 1, name: "Stasiun Pelabuhan TPI", coords: [1.666111, 101.500667] },
            { id: 2, name: "Stasiun Bagan Besar", coords: [1.691, 101.429694] },
            { id: 3, name: "Stasiun Bengkalis Pusat", coords: [0.53975, 101.447694] }
        ],
        api: {
            weather: 'https://api.open-meteo.com/v1/forecast?latitude=1.685167,1.666111,1.691,0.53975&longitude=101.4785,101.500667,101.429694,101.447694&hourly=temperature_2m,weather_code,relative_humidity_2m,rain,wind_speed_10m,wind_direction_10m&timezone=Asia%2FBangkok&past_days=3',
            tidal: 'https://marine-api.open-meteo.com/v1/marine?latitude=2.045354&longitude=101.993829&timezone=Asia%2FBangkok&past_days=2&forecast_days=5&minutely_15=sea_level_height_msl'
        },
        waterLevelThresholds: {
            bahaya: 1.5,
            waspada: 0.8
        },
        updateInterval: 60000 // 60 seconds
    },
    state: {
        stationData: [],
        weatherData: null,
        tidalData: null,
        map: null,
        markers: {},
        charts: {},
        selectedWeatherStationId: 0,
        isLoading: true,
    },
    elements: {},

    // --- 2. INITIALIZATION ---
    init() {
        console.log("SI-ROB Dashboard Initializing...");
        this.cacheDOMElements();
        this.setupEventListeners();
        this.ui.updateClock();
        setInterval(this.ui.updateClock, 1000);
        lucide.createIcons();
        this.ui.showTab('beranda');
        this.loadInitialData();
    },

    async loadInitialData() {
        this.ui.setLoading(true);
        this.ui.initializeMap();
        this.ui.populateStationDropdown();
        await Promise.all([this.api.fetchWeatherData(), this.api.fetchTidalData()]);
        this.data.processData();
        this.ui.updateUI();
        this.ui.setLoading(false);
        console.log("Initial data loaded. State:", this.state);
        setInterval(() => this.updateDataAndUI(), this.config.updateInterval);
    },

    async updateDataAndUI() {
        console.log("Fetching latest data...");
        await this.api.fetchTidalData();
        this.data.processData();
        this.ui.updateUI();
        console.log("UI updated with new data.");
    },

    cacheDOMElements() {
        this.elements = {
            navTabs: document.querySelectorAll('.nav-tab'),
            mobileMenuButton: document.getElementById('mobile-menu-button'),
            navigationMenu: document.getElementById('navigation-menu'),
            tabContents: document.querySelectorAll('.tab-content'),
            datetime: document.getElementById('datetime'),
            map: document.getElementById('map'),
            generalAlert: document.getElementById('general-alert'),
            alertIconContainer: document.getElementById('alert-icon-container'),
            alertIcon: document.getElementById('alert-icon'),
            alertTitle: document.getElementById('alert-title'),
            alertMessage: document.getElementById('alert-message'),
            summaryContainer: document.getElementById('summary-container'),
            stationList: document.getElementById('station-list'),
            stationSelect: document.getElementById('station-select'),
            weatherIcon: document.getElementById('weather-icon'),
            weatherDescription: document.getElementById('weather-description'),
            weatherTempCurrent: document.getElementById('weather-temp-current'),
            windSpeed: document.getElementById('wind-speed'),
            windDirection: document.getElementById('wind-direction'),
            hourlyForecastContainer: document.getElementById('hourly-forecast-container'),
            weatherChartCanvas: document.getElementById('weather-chart'),
            tidalChartCanvas: document.getElementById('tidal-chart'),
            chartLoader: document.getElementById('chart-loader'),
            historyModal: document.getElementById('history-modal'),
            closeHistoryModal: document.getElementById('close-history-modal'),
            historyModalTitle: document.getElementById('history-modal-title'),
            historyChartCanvas: document.getElementById('history-chart'),
            cctvModal: document.getElementById('cctv-modal'),
            closeCctvModal: document.getElementById('close-cctv-modal'),
            cctvModalTitle: document.getElementById('cctv-modal-title'),
            waterLevelOverlay: document.getElementById('water-level-overlay'),
            virtualTideStaff: document.getElementById('virtual-tide-staff'),
            waterLevelText: document.getElementById('water-level-text'),
        };
    },

    setupEventListeners() {
        this.elements.navTabs.forEach(tab => tab.addEventListener('click', e => {
            e.preventDefault();
            this.ui.showTab(tab.dataset.tab);
        }));
        this.elements.mobileMenuButton.addEventListener('click', () => this.elements.navigationMenu.classList.toggle('hidden'));
        this.elements.stationSelect.addEventListener('change', e => {
            this.state.selectedWeatherStationId = parseInt(e.target.value);
            this.ui.renderWeatherTab();
        });
        this.elements.closeHistoryModal.addEventListener('click', () => this.ui.closeModal('history'));
        this.elements.closeCctvModal.addEventListener('click', () => this.ui.closeModal('cctv'));
    },

    // --- 3. API & DATA HANDLING ---
    api: {
        async fetchWeatherData() { try { const res = await fetch(app.config.api.weather); if (!res.ok) throw new Error(res.status); app.state.weatherData = await res.json(); } catch (e) { console.error("Error fetching weather data:", e); } },
        async fetchTidalData() { try { const res = await fetch(app.config.api.tidal); if (!res.ok) throw new Error(res.status); app.state.tidalData = await res.json(); } catch (e) { console.error("Error fetching tidal data:", e); } }
    },

    data: {
        processData() {
            if (!app.state.tidalData) return;
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            const now = new Date();
            const closestTimeIndex = time.reduce((p, c, i) => (Math.abs(new Date(c) - now) < Math.abs(new Date(time[p]) - now) ? i : p), 0);
            const currentSeaLevel = sea_level_height_msl[closestTimeIndex];

            if (app.state.stationData.length === 0) {
                app.state.stationData = app.config.stations.map(s => ({ ...s, waterLevel: 0, status: 'Aman', history: [] }));
            }

            app.state.stationData.forEach(station => {
                const error = 1 + (Math.random() - 0.5) * 0.1;
                const newLevel = currentSeaLevel * error;
                station.waterLevel = Math.max(0, newLevel);
                station.status = station.waterLevel > app.config.waterLevelThresholds.bahaya ? "Bahaya" : station.waterLevel > app.config.waterLevelThresholds.waspada ? "Waspada" : "Aman";
                station.history.push({ time: new Date(), level: station.waterLevel });
            });
        }
    },
    
    // --- 4. UI & RENDERING ---
    ui: {
        updateUI() {
            this.updateGeneralAlert();
            this.updateSummary();
            this.updateStationList();
            this.updateMapMarkers();
            this.renderWeatherTab();
            this.renderTidalChart();
            lucide.createIcons();
        },
        
        setLoading(isLoading) {
            app.state.isLoading = isLoading;
            app.elements.chartLoader.style.display = isLoading ? 'flex' : 'none';
        },

        updateClock() {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
            app.elements.datetime.textContent = now.toLocaleDateString('id-ID', options) + ' WIB';
        },
        
        showTab(tabId) {
            app.elements.tabContents.forEach(c => c.classList.add('hidden'));
            app.elements.navTabs.forEach(t => t.classList.remove('active'));
            document.getElementById(`${tabId}-content`).classList.remove('hidden');
            document.querySelector(`.nav-tab[data-tab="${tabId}"]`).classList.add('active');
            if (tabId === 'beranda' && app.state.map) setTimeout(() => app.state.map.invalidateSize(), 100);
            if (!app.elements.navigationMenu.classList.contains('lg:flex')) app.elements.navigationMenu.classList.add('hidden');
        },
        
        initializeMap() {
            if (app.state.map) return;
            app.state.map = L.map(app.elements.map).setView([1.2, 101.45], 9);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(app.state.map);
            app.config.stations.forEach(s => { app.state.markers[s.id] = L.marker(s.coords).addTo(app.state.map); });
        },

        updateMapMarkers() {
            if (!app.state.map) return;
            app.state.stationData.forEach(station => {
                const marker = app.state.markers[station.id];
                const statusInfo = this.getStatusInfo(station.status);
                marker.setIcon(this.createMarkerIcon(statusInfo.color));
                marker.unbindPopup().bindPopup(this.createPopupContent(station, statusInfo));
            });
        },
        
        createMarkerIcon(color) {
            const html = `<div class="relative flex justify-center items-center"><div class="pulse" style="background-color: ${color};"></div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2" class="relative"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`;
            return L.divIcon({ html: html, className: '', iconSize: [24, 24], iconAnchor: [12, 24] });
        },

        createPopupContent(station, statusInfo) {
            const container = document.createElement('div');
            container.innerHTML = `<div class="popup-title">${station.name}</div>
                <div><strong>Status:</strong> <span style="color: ${statusInfo.color}; font-weight: bold;">${station.status}</span></div>
                <div><strong>Ketinggian Air:</strong> ${station.waterLevel.toFixed(2)} m</div>
                <div class="mt-3 flex space-x-2">
                    <button class="popup-button popup-button-primary" data-action="history">Riwayat</button>
                    <button class="popup-button popup-button-secondary" data-action="cctv">CCTV</button>
                </div>`;
            container.querySelector('[data-action="history"]').addEventListener('click', () => this.openModal('history', station.id));
            container.querySelector('[data-action="cctv"]').addEventListener('click', () => this.openModal('cctv', station.id));
            return container;
        },

        updateGeneralAlert() {
            const counts = app.state.stationData.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});
            const level = counts.Bahaya > 0 ? "Bahaya" : counts.Waspada > 0 ? "Waspada" : "Aman";
            const info = this.getStatusInfo(level);
            app.elements.alertIcon.setAttribute('data-lucide', info.icon);
            app.elements.alertTitle.textContent = `Peringatan Banjir Rob: ${info.text}`;
            app.elements.alertMessage.textContent = info.message;
            app.elements.generalAlert.style.backgroundColor = info.bgColor;
            app.elements.alertIconContainer.style.backgroundColor = info.color;
        },
        
        updateSummary() {
            if (!app.state.weatherData || !app.state.tidalData) return;
            const { hourly } = app.state.weatherData[0]; // Use Dumai as reference
            const now = new Date();
            const now_hourly = now.toISOString().slice(0, 13) + ":00";
            const idx = hourly.time.indexOf(now_hourly);
            if (idx === -1) return;

            const { sea_level_height_msl } = app.state.tidalData.minutely_15;
            const maxTide = Math.max(...sea_level_height_msl.slice(0, 96*2)); // Next 48 hours
            
            app.elements.summaryContainer.innerHTML = `
                <div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="thermometer" class="w-4 h-4 mr-2 text-gray-500"></i>Suhu</span><span class="font-bold">${hourly.temperature_2m[idx]}°C</span></div>
                <div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="wind" class="w-4 h-4 mr-2 text-gray-500"></i>Angin</span><span>${hourly.wind_speed_10m[idx]} km/j</span></div>
                <div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="waves" class="w-4 h-4 mr-2 text-gray-500"></i>Pasang Tertinggi (48j)</span><span class="font-bold text-pertamina-blue">${maxTide.toFixed(2)} m</span></div>
            `;
            lucide.createIcons();
        },

        updateStationList() {
            app.elements.stationList.innerHTML = '';
            app.state.stationData.forEach(station => {
                const statusInfo = this.getStatusInfo(station.status);
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center p-2 rounded-md hover:bg-gray-50 cursor-pointer';
                item.onclick = () => app.state.map.setView(station.coords, 14);
                item.innerHTML = `<div><p class="font-semibold">${station.name}</p><p class="text-xs text-gray-500">Ketinggian: ${station.waterLevel.toFixed(2)} m</p></div><span class="px-2 py-1 text-xs font-bold text-white rounded-full" style="background-color: ${statusInfo.color};">${station.status}</span>`;
                app.elements.stationList.appendChild(item);
            });
        },
        
        populateStationDropdown() {
            app.elements.stationSelect.innerHTML = '';
            app.config.stations.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.name;
                app.elements.stationSelect.appendChild(opt);
            });
        },
        
        renderWeatherTab() {
            const stationId = app.state.selectedWeatherStationId;
            if (!app.state.weatherData) return;
            const stationWeather = app.state.weatherData[stationId];
            if (!stationWeather) return;
            const { time, temperature_2m, weather_code, wind_speed_10m, wind_direction_10m, rain } = stationWeather.hourly;
            
            const now = new Date();
            const now_hourly = now.toISOString().slice(0, 13) + ":00";
            const currentIndex = time.indexOf(now_hourly);
            if (currentIndex === -1) return;

            // Update current conditions panel
            const wmoInfo = this.getWmoCodeInfo(weather_code[currentIndex]);
            app.elements.weatherIcon.setAttribute('data-lucide', wmoInfo.icon);
            app.elements.weatherDescription.textContent = wmoInfo.description;
            app.elements.weatherTempCurrent.textContent = `${temperature_2m[currentIndex].toFixed(1)}°C`;
            app.elements.windSpeed.textContent = `${wind_speed_10m[currentIndex].toFixed(1)} km/h`;
            app.elements.windDirection.textContent = `Arah ${wind_direction_10m[currentIndex]}°`;

            // Update hourly forecast cards
            app.elements.hourlyForecastContainer.innerHTML = '';
            const forecastHours = [1, 2, 3, 6, 9, 12, 18, 24]; // hours from now
            forecastHours.forEach(h => {
                const forecastIndex = currentIndex + h;
                if (forecastIndex >= time.length) return;
                const forecastTime = new Date(time[forecastIndex]);
                const cardWmo = this.getWmoCodeInfo(weather_code[forecastIndex]);
                const card = document.createElement('div');
                card.className = 'text-center p-2 rounded-lg border bg-white flex-shrink-0 w-24';
                card.innerHTML = `<p class="font-semibold text-sm">${forecastTime.getHours()}:00</p>
                    <i data-lucide="${cardWmo.icon}" class="w-8 h-8 mx-auto my-1 text-gray-600"></i>
                    <p class="font-bold text-lg">${temperature_2m[forecastIndex].toFixed(0)}°C</p>`;
                app.elements.hourlyForecastContainer.appendChild(card);
            });
            lucide.createIcons();
            
            // Render 48-hour trend chart
            const chartLabels = time.slice(currentIndex, currentIndex + 48).map(t => new Date(t));
            if (app.state.charts.weather) app.state.charts.weather.destroy();
            app.state.charts.weather = new Chart(app.elements.weatherChartCanvas, {
                data: {
                    labels: chartLabels,
                    datasets: [
                        { type: 'line', label: 'Suhu (°C)', data: temperature_2m.slice(currentIndex, currentIndex + 48), borderColor: 'var(--pertamina-red)', yAxisID: 'y_temp', tension: 0.4 },
                        { type: 'bar', label: 'Hujan (mm)', data: rain.slice(currentIndex, currentIndex + 48), backgroundColor: 'var(--pertamina-blue)', yAxisID: 'y_rain' }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, interaction: { intersect: false },
                    scales: {
                        x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } } },
                        y_temp: { position: 'left', title: { display: true, text: 'Suhu (°C)' } },
                        y_rain: { position: 'right', title: { display: true, text: 'Hujan (mm)' }, grid: { drawOnChartArea: false }, beginAtZero: true }
                    }
                }
            });
        },

        renderTidalChart() {
            if (!app.state.tidalData) return;
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            const labels = time.map(t => new Date(t));
            const now = new Date();

            if (app.state.charts.tidal) app.state.charts.tidal.destroy();
            app.state.charts.tidal = new Chart(app.elements.tidalChartCanvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ketinggian Permukaan Laut (m)', data: sea_level_height_msl,
                        borderColor: 'var(--pertamina-blue)', backgroundColor: 'rgba(60, 109, 178, 0.2)',
                        fill: true, tension: 0.1, pointRadius: 0,
                        segment: {
                            borderColor: ctx => (ctx.p1.parsed.x > now.valueOf() ? 'var(--pertamina-green)' : undefined),
                            borderDash: ctx => (ctx.p1.parsed.x > now.valueOf() ? [5, 5] : undefined),
                        }
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, interaction: { intersect: false },
                    plugins: {
                        filler: { propagate: false },
                        annotation: {
                            annotations: {
                                nowLine: { type: 'line', xMin: now, xMax: now, borderColor: 'var(--pertamina-red)', borderWidth: 2,
                                    label: { content: 'Sekarang', display: true, position: 'start', color: 'white', backgroundColor: 'var(--pertamina-red)' }
                                }
                            }
                        }
                    },
                    scales: {
                        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd, HH:mm' } },
                        y: { title: { display: true, text: 'Ketinggian (m)' } }
                    }
                }
            });
        },

        openModal(type, stationId) {
            const station = app.state.stationData.find(s => s.id === stationId);
            if (!station) return;
            if (type === 'history') {
                app.elements.historyModalTitle.textContent = `Riwayat Ketinggian Air: ${station.name}`;
                this.renderHistoryChart(station);
                app.elements.historyModal.classList.remove('hidden');
            } else if (type === 'cctv') {
                app.elements.cctvModalTitle.textContent = `CCTV: ${station.name}`;
                this.updateCctvVisuals(station);
                app.elements.cctvModal.classList.remove('hidden');
            }
        },

        closeModal(type) { document.getElementById(`${type}-modal`).classList.add('hidden'); },
        
        renderHistoryChart(station) {
            const history = station.history.slice(-100); // Show last 100 updates
            const labels = history.map(h => h.time);
            const data = history.map(h => h.level);
            if (app.state.charts.history) app.state.charts.history.destroy();
            app.state.charts.history = new Chart(app.elements.historyChartCanvas, {
                type: 'line',
                data: { labels, datasets: [{ label: 'Ketinggian Air (m)', data, borderColor: 'var(--pertamina-blue)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'minute', tooltipFormat: 'HH:mm:ss' } }, y: { beginAtZero: true } } }
            });
        },
        
        updateCctvVisuals(station) {
            const maxLevel = 2.5;
            const percent = (station.waterLevel / maxLevel) * 100;
            app.elements.waterLevelOverlay.style.height = `${percent}%`;
            app.elements.waterLevelText.textContent = `${station.waterLevel.toFixed(2)} m`;
            app.elements.virtualTideStaff.innerHTML = '';
            for (let i = 0; i <= maxLevel; i += 0.5) {
                const el = document.createElement('div');
                el.className = 'w-full text-right pr-2 text-xs font-mono border-t border-gray-500';
                el.style.flexBasis = `${(0.5 / maxLevel) * 100}%`;
                el.textContent = `${i.toFixed(1)}m`;
                app.elements.virtualTideStaff.appendChild(el);
            }
        },
        
        getWmoCodeInfo(code) {
            const wmo = { 0: {d: "Cerah", i: "sun"}, 1: {d: "Cerah Berawan", i: "cloud-sun"}, 2: {d: "Berawan", i: "cloud"}, 3: {d: "Sangat Berawan", i: "clouds"}, 45: {d: "Kabut", i: "cloud-fog"}, 61: {d: "Hujan Ringan", i: "cloud-drizzle"}, 63: {d: "Hujan Sedang", i: "cloud-rain"}, 65: {d: "Hujan Lebat", i: "cloud-rain-wind"}, 80: {d: "Hujan Lokal", i: "cloud-lightning"}, 95: {d: "Badai Petir", i: "zap"} };
            const info = wmo[code] || { d: "Tidak Diketahui", i: "help-circle" };
            return { description: info.d, icon: info.i };
        },

        getStatusInfo(status) {
            const statuses = {
                Bahaya: { c: 'var(--status-bahaya)', bg: '#fee2e2', i: 'shield-alert', t: 'BAHAYA', m: 'Level air berbahaya terdeteksi.'},
                Waspada: { c: 'var(--status-waspada)', bg: '#fef3c7', i: 'shield-check', t: 'WASPADA', m: 'Level air meningkat, harap waspada.'},
                Aman: { c: 'var(--status-aman)', bg: '#dcfce7', i: 'shield', t: 'AMAN', m: 'Semua stasiun dalam kondisi normal.'}
            };
            const s = statuses[status];
            return { color: s.c, bgColor: s.bg, icon: s.i, text: s.t, message: s.m };
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
