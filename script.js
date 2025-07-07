/**
 * SI-ROB Dashboard Application
 * Version 3.0 - Final Rotation & Color Fixes
 * Author: Gemini
 */
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
            weather: 'https://api.open-meteo.com/v1/forecast?latitude=1.685167,1.666111,1.691,0.53975&longitude=101.4785,101.500667,101.429694,101.447694&hourly=temperature_2m,weather_code,relative_humidity_2m,rain,wind_speed_10m,wind_direction_10m&timezone=Asia%2FBangkok&past_days=3&elevation=NaN,NaN,NaN,NaN',
            tidal: 'https://marine-api.open-meteo.com/v1/marine?latitude=2.045354&longitude=101.993829&timezone=Asia%2FBangkok&past_days=2&forecast_days=5&minutely_15=sea_level_height_msl'
        },
        waterLevelThresholds: {
            bahaya: 1.5,
            waspada: 0.8
        },
        updateInterval: 300000 // 5 minutes
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
        activeTab: 'beranda',
    },
    elements: {},

    // --- 2. INITIALIZATION ---
    init() {
        console.log("SI-ROB Dashboard v3.0 Initializing...");
        this.cacheDOMElements();
        this.setupEventListeners();
        this.ui.updateClock();
        setInterval(this.ui.updateClock, 1000);
        lucide.createIcons();
        this.ui.showTab('beranda', true);
        this.loadInitialData();
    },

    async loadInitialData() {
        this.ui.setLoading(true, 'all');
        this.ui.initializeMap();
        this.ui.populateStationDropdown();
        
        try {
            await Promise.all([this.api.fetchWeatherData(), this.api.fetchTidalData()]);
            this.data.processAllData();
        } catch (error) {
            console.error("Failed to load initial data:", error);
            this.ui.showError("Gagal memuat data awal. Periksa koneksi internet Anda.");
        } finally {
            this.ui.setLoading(false, 'all');
            this.ui.updateFullUI();
            console.log("Initial data loaded. Current State:", this.state);
            setInterval(() => this.updateDataAndUI(), this.config.updateInterval);
        }
    },

    async updateDataAndUI() {
        console.log("Periodically fetching latest data...");
        this.ui.showToast("Memperbarui data...");
        try {
            await this.api.fetchTidalData();
            this.data.processAllData();
            this.ui.updateFullUI();
            this.ui.showToast("Data berhasil diperbarui.", "success");
        } catch (error) {
            console.error("Failed to update data:", error);
            this.ui.showToast("Gagal memperbarui data.", "error");
        }
    },

    cacheDOMElements() {
        const ids = [
            'mobile-menu-button', 'mobile-navigation-menu', 'desktop-navigation-menu', 'datetime', 'mobile-datetime', 'map',
            'general-alert', 'alert-icon-container', 'alert-icon', 'alert-title', 'alert-message',
            'summary-container', 'station-list', 'station-select', 'current-weather-location',
            'weather-icon-main', 'weather-description', 'weather-temp-current',
            'detail-temp', 'detail-humidity', 'detail-rain', 'detail-wind-speed', 'detail-wind-dir', 'detail-wind-name',
            'wind-direction-arrow', 'weather-charts-container', 'weather-chart-loader',
            'main-weather-chart', 'rain-chart', 'wind-chart',
            'tidal-chart-container', 'tidal-chart', 'chart-loader',
            'history-modal', 'close-history-modal', 'history-modal-title', 'history-chart', 'history-chart-loader',
            'cctv-modal', 'close-cctv-modal', 'cctv-modal-title', 'water-level-overlay',
            'virtual-tide-staff', 'water-level-text'
        ];
        ids.forEach(id => {
            const camelCaseId = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
            this.elements[camelCaseId] = document.getElementById(id);
        });
        
        this.elements.navTabs = document.querySelectorAll('.nav-tab');
        this.elements.tabContents = document.querySelectorAll('.tab-content');
    },

    setupEventListeners() {
        this.elements.navTabs.forEach(tab => {
            tab.addEventListener('click', e => {
                e.preventDefault();
                const tabId = tab.dataset.tab;
                this.ui.showTab(tabId);
            });
        });

        this.elements.mobileMenuButton.addEventListener('click', () => {
            const menu = this.elements.mobileNavigationMenu;
            menu.classList.toggle('hidden');
            menu.classList.toggle('flex');
        });

        this.elements.stationSelect.addEventListener('change', e => {
            this.state.selectedWeatherStationId = parseInt(e.target.value);
            this.ui.renderWeatherTab();
        });

        this.elements.closeHistoryModal.addEventListener('click', () => this.ui.closeModal('history'));
        this.elements.closeCctvModal.addEventListener('click', () => this.ui.closeModal('cctv'));
        
        this.elements.mobileNavigationMenu.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                 const menu = this.elements.mobileNavigationMenu;
                 menu.classList.add('hidden');
                 menu.classList.remove('flex');
            });
        });
    },

    // --- 3. API & DATA HANDLING ---
    api: {
        async fetchWeatherData() {
            try {
                const res = await fetch(app.config.api.weather);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                app.state.weatherData = await res.json();
                console.log("Weather data fetched successfully.");
            } catch (e) {
                console.error("Error fetching weather data:", e);
                throw e;
            }
        },
        async fetchTidalData() {
            try {
                const res = await fetch(app.config.api.tidal);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                app.state.tidalData = await res.json();
                console.log("Tidal data fetched successfully.");
            } catch (e) {
                console.error("Error fetching tidal data:", e);
                throw e;
            }
        }
    },

    data: {
        processAllData() {
            if (!app.state.tidalData || !app.state.tidalData.minutely_15) {
                console.warn("Tidal data not available for processing.");
                return;
            }
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            const now = new Date();
            
            const closestTimeIndex = time.reduce((prev, curr, i) => 
                (Math.abs(new Date(curr) - now) < Math.abs(new Date(time[prev]) - now) ? i : prev), 0);
            
            const currentSeaLevel = sea_level_height_msl[closestTimeIndex];

            if (isNaN(currentSeaLevel)) {
                console.error("Current sea level is not a number.");
                return;
            }

            if (app.state.stationData.length === 0) {
                app.state.stationData = app.config.stations.map(s => ({ ...s, waterLevel: 0, status: 'Aman' }));
            }

            app.state.stationData.forEach(station => {
                const errorMargin = 1 + (Math.random() - 0.5) * 0.10;
                const newLevel = currentSeaLevel * errorMargin;
                station.waterLevel = Math.max(0, newLevel);
                station.status = this.getWaterLevelStatus(station.waterLevel);
            });
        },

        getWaterLevelStatus(level) {
            if (level > app.config.waterLevelThresholds.bahaya) return "Bahaya";
            if (level > app.config.waterLevelThresholds.waspada) return "Waspada";
            return "Aman";
        }
    },
    
    // --- 4. UI & RENDERING ---
    ui: {
        updateFullUI() {
            if (app.state.isLoading) return;
            console.log("Performing full UI update.");
            this.updateGeneralAlert();
            this.updateSummary();
            this.updateStationList();
            this.updateMapMarkers();
            this.renderActiveTab();
        },
        
        renderActiveTab() {
            switch(app.state.activeTab) {
                case 'cuaca':
                    this.renderWeatherTab();
                    break;
                case 'pasut':
                    this.renderTidalChart();
                    break;
                default:
                    lucide.createIcons();
            }
        },

        setLoading(isLoading, scope = 'chart') {
            app.state.isLoading = isLoading;
            const display = isLoading ? 'flex' : 'none';
            if (scope === 'all' || scope === 'chart') {
                app.elements.chartLoader.style.display = display;
            }
            if (scope === 'all' || scope === 'weather') {
                app.elements.weatherChartLoader.style.display = display;
            }
             if (scope === 'all' || scope === 'history') {
                app.elements.historyChartLoader.style.display = display;
            }
        },

        updateClock() {
            const now = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' };
            const timeString = now.toLocaleDateString('id-ID', options) + ' WIB';
            app.elements.datetime.textContent = timeString;
            app.elements.mobileDatetime.textContent = timeString;
        },
        
        showTab(tabId, isInitial = false) {
            if (!isInitial && app.state.activeTab === tabId) return;

            app.state.activeTab = tabId;
            app.elements.tabContents.forEach(c => c.classList.add('hidden'));
            app.elements.navTabs.forEach(t => t.classList.remove('active'));
            
            document.getElementById(`${tabId}-content`).classList.remove('hidden');
            document.querySelectorAll(`.nav-tab[data-tab="${tabId}"]`).forEach(t => t.classList.add('active'));

            if (!app.state.isLoading) {
                this.renderActiveTab();
            }

            if (tabId === 'beranda' && app.state.map) {
                setTimeout(() => app.state.map.invalidateSize(), 100);
            }
        },
        
        initializeMap() {
            if (app.state.map) return;
            app.state.map = L.map(app.elements.map).setView([1.2, 101.45], 9);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
                attribution: '&copy; OpenStreetMap contributors' 
            }).addTo(app.state.map);
            app.config.stations.forEach(s => {
                app.state.markers[s.id] = L.marker(s.coords).addTo(app.state.map);
            });
        },

        updateMapMarkers() {
            if (!app.state.map || app.state.stationData.length === 0) return;
            app.state.stationData.forEach(station => {
                const marker = app.state.markers[station.id];
                const statusInfo = this.getStatusInfo(station.status);
                marker.setIcon(this.createMarkerIcon(statusInfo.color));
                marker.unbindPopup().bindPopup(this.createPopupContent(station, statusInfo));
            });
        },
        
        createMarkerIcon(color) {
            const html = `<div class="relative flex justify-center items-center">
                            <div class="pulse" style="background-color: ${color};"></div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="relative map-marker-svg">
                                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                          </div>`;
            return L.divIcon({ html: html, className: '', iconSize: [28, 28], iconAnchor: [14, 28] });
        },

        createPopupContent(station, statusInfo) {
            const container = document.createElement('div');
            container.className = '';
            container.innerHTML = `<div class="popup-title">${station.name}</div>
                <div class="text-sm space-y-1">
                    <div class="flex justify-between"><span>Status:</span> <strong style="color: ${statusInfo.color};">${station.status}</strong></div>
                    <div class="flex justify-between"><span>Ketinggian:</span> <strong>${station.waterLevel.toFixed(2)} m</strong></div>
                </div>
                <div class="mt-3 flex space-x-2">
                    <button class="popup-button popup-button-primary flex-1" data-action="history">Riwayat</button>
                    <button class="popup-button popup-button-secondary flex-1" data-action="cctv">CCTV</button>
                </div>`;
            container.querySelector('[data-action="history"]').addEventListener('click', () => this.openModal('history', station.id));
            container.querySelector('[data-action="cctv"]').addEventListener('click', () => this.openModal('cctv', station.id));
            return container;
        },

        updateGeneralAlert() {
            const counts = app.state.stationData.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});
            const overallStatus = counts.Bahaya > 0 ? "Bahaya" : counts.Waspada > 0 ? "Waspada" : "Aman";
            const info = this.getStatusInfo(overallStatus);
            
            app.elements.alertIcon.setAttribute('data-lucide', info.icon);
            app.elements.alertTitle.textContent = `Status Peringatan: ${info.text}`;
            app.elements.alertMessage.textContent = info.message;
            app.elements.generalAlert.style.backgroundColor = info.bgColor;
            app.elements.generalAlert.style.borderColor = info.color;
            app.elements.generalAlert.classList.add('border-l-4');
            app.elements.alertIconContainer.style.backgroundColor = info.color;
            lucide.createIcons({
                nodes: [app.elements.alertIcon]
            });
        },
        
        updateSummary() {
            if (!app.state.weatherData || !app.state.tidalData || !app.state.tidalData.minutely_15) return;
            const stationWeather = app.state.weatherData[app.state.selectedWeatherStationId];
            const { hourly: weatherHourly } = stationWeather;
            const { minutely_15: tidalData } = app.state.tidalData;

            const now = new Date();
            const now_hourly_iso = now.toISOString().slice(0, 13) + ":00";
            const weatherIdx = weatherHourly.time.indexOf(now_hourly_iso);
            if (weatherIdx === -1) return;

            const maxTide = Math.max(...tidalData.sea_level_height_msl.slice(0, 4 * 48)); 
            
            app.elements.summaryContainer.innerHTML = `
                <div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="thermometer" class="w-4 h-4 mr-2 text-gray-500"></i>Suhu Udara</span><span class="font-bold">${weatherHourly.temperature_2m[weatherIdx]}°C</span></div>
                <div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="wind" class="w-4 h-4 mr-2 text-gray-500"></i>Kecepatan Angin</span><span>${weatherHourly.wind_speed_10m[weatherIdx]} km/j</span></div>
                <div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="waves" class="w-4 h-4 mr-2 text-gray-500"></i>Pasang Tertinggi (48j)</span><span class="font-bold text-pertamina-blue">${maxTide.toFixed(2)} m</span></div>
            `;
            lucide.createIcons({
                 nodes: app.elements.summaryContainer.querySelectorAll('[data-lucide]')
            });
        },

        updateStationList() {
            app.elements.stationList.innerHTML = '';
            app.state.stationData.forEach(station => {
                const statusInfo = this.getStatusInfo(station.status);
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center p-2.5 rounded-md hover:bg-gray-50 cursor-pointer border-l-4';
                item.style.borderColor = statusInfo.color;
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
            this.setLoading(true, 'weather');
            if (!app.state.weatherData) {
                console.warn("Weather data not ready for rendering.");
                this.setLoading(false, 'weather');
                return;
            }
            
            const stationId = app.state.selectedWeatherStationId;
            const station = app.config.stations[stationId];
            const stationWeather = app.state.weatherData[stationId];
            if (!stationWeather) return;

            const { time, temperature_2m, weather_code, relative_humidity_2m, rain, wind_speed_10m, wind_direction_10m } = stationWeather.hourly;
            
            const now = new Date();
            // Find the index of the time closest to the current time "now"
            const currentIndex = time.reduce((closestIndex, currentTime, i) => {
            const currentDiff = Math.abs(new Date(currentTime) - now);
            const closestDiff = Math.abs(new Date(time[closestIndex]) - now);
            return currentDiff < closestDiff ? i : closestIndex;
            }, 0);
            if (currentIndex === -1) {
                console.warn("Could not find current hour in weather data.");
                this.setLoading(false, 'weather');
                return;
            }

            const wmoInfo = this.getWmoCodeInfo(weather_code[currentIndex]);
            app.elements.currentWeatherLocation.textContent = station.name;
            app.elements.weatherIconMain.setAttribute('data-lucide', wmoInfo.icon);
            app.elements.weatherDescription.textContent = wmoInfo.description;
            app.elements.weatherTempCurrent.textContent = `${temperature_2m[currentIndex].toFixed(1)}°C`;
            
            app.elements.detailTemp.textContent = `${temperature_2m[currentIndex].toFixed(1)}°C`;
            app.elements.detailHumidity.textContent = `${relative_humidity_2m[currentIndex]}%`;
            app.elements.detailRain.textContent = `${rain[currentIndex]} mm`;
            app.elements.detailWindSpeed.textContent = `${wind_speed_10m[currentIndex]} km/j`;
            app.elements.detailWindDir.textContent = `${wind_direction_10m[currentIndex]}°`;
            
            // FIX: Correct the arrow rotation. The `navigation` icon points NE (45deg), and wind direction is "from", so we point 180deg away.
            // Final rotation = (API_degrees + 180) - 45
            app.elements.windDirectionArrow.style.transform = `rotate(${wind_direction_10m[currentIndex] + 135}deg)`;
            
            const windName = this.getWindDirectionName(wind_direction_10m[currentIndex]);
            app.elements.detailWindName.textContent = windName;

            const chartLabels = time.map(t => new Date(t)); // Use the full time array
const chartData = {
    temp: temperature_2m,       // Use the full temperature array
    humidity: relative_humidity_2m, // Use the full humidity array
    rain: rain,                 // Use the full rain array
    wind: wind_speed_10m,         // Use the full wind array
};

            this.renderMainWeatherChart(chartLabels, chartData, now);
            this.renderSecondaryWeatherCharts(chartLabels, chartData, now);
            
            // FIX: Call lucide.createIcons() BEFORE trying to modify the generated SVG
            lucide.createIcons();
            
            const umbrellaSvg = document.querySelector('.weather-detail-card svg.lucide-umbrella');
            if (umbrellaSvg) {
                umbrellaSvg.classList.remove('text-blue-500');
                umbrellaSvg.classList.add('text-gray-700');
            }

            this.setLoading(false, 'weather');
        },

        renderMainWeatherChart(labels, data, now) {
            const canvas = app.elements.mainWeatherChart;
            const ctx = canvas.getContext('2d');
            const nowValue = now.valueOf();

            const tempGradient = ctx.createLinearGradient(0, 0, 0, 320);
            tempGradient.addColorStop(0, 'rgba(186, 49, 59, 0.4)');
            tempGradient.addColorStop(1, 'rgba(186, 49, 59, 0)');
            
            const humidityGradient = ctx.createLinearGradient(0, 0, 0, 320);
            humidityGradient.addColorStop(0, 'rgba(60, 109, 178, 0.4)');
            humidityGradient.addColorStop(1, 'rgba(60, 109, 178, 0)');

            if (app.state.charts.mainWeather) app.state.charts.mainWeather.destroy();
            app.state.charts.mainWeather = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { 
                            label: 'Suhu', 
                            data: data.temp, 
                            borderColor: 'var(--pertamina-red)', 
                            backgroundColor: tempGradient, 
                            yAxisID: 'y_temp', 
                            fill: true, 
                            tension: 0.4, 
                            pointRadius: 0, 
                            pointHoverRadius: 5,
                            segment: {
                                borderDash: ctx => (ctx.p1.parsed.x > nowValue ? [5, 5] : undefined),
                            }
                        },
                        { 
                            label: 'Kelembapan', 
                            data: data.humidity, 
                            borderColor: 'var(--pertamina-blue)', 
                            backgroundColor: humidityGradient, 
                            yAxisID: 'y_humidity', 
                            fill: true, 
                            tension: 0.4, 
                            pointRadius: 0, 
                            pointHoverRadius: 5,
                            segment: {
                                borderDash: ctx => (ctx.p1.parsed.x > nowValue ? [5, 5] : undefined),
                            }
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'top', labels: { usePointStyle: true } },
                        tooltip: { enabled: true, backgroundColor: '#fff', titleColor: '#333', bodyColor: '#333', borderColor: '#ddd', borderWidth: 1, padding: 10, usePointStyle: true },
                        annotation: {
                            annotations: {
                                nowLine: {
                                    type: 'line',
                                    xMin: now,
                                    xMax: now,
                                    borderColor: 'var(--pertamina-red)',
                                    borderWidth: 2,
                                    label: {
                                        content: 'Sekarang',
                                        display: true,
                                        position: 'start',
                                        color: 'white',
                                        backgroundColor: 'var(--pertamina-red)',
                                        font: { weight: 'bold' }
                                    }
                                }
                            }
                        }
                    },
                    scales: {
                        x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'dd-MMM HH:mm' } }, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                        y_temp: { type: 'linear', position: 'left', title: { display: true, text: 'Suhu (°C)', color: 'var(--pertamina-red)' }, grid: { color: '#e9ecef' } },
                        y_humidity: { type: 'linear', position: 'right', title: { display: true, text: 'Kelembapan (%)', color: 'var(--pertamina-blue)' }, grid: { drawOnChartArea: false } }
                    }
                }
            });
        },

        renderSecondaryWeatherCharts(labels, data, now) {
            const nowValue = now.valueOf();
            const sharedOptions = {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: false }, tooltip: { enabled: true, displayColors: false } },
                scales: { x: { display: false }, y: { grid: { color: '#e9ecef' }, ticks: { maxTicksLimit: 4 } } }
            };

            if (app.state.charts.rain) app.state.charts.rain.destroy();
            app.state.charts.rain = new Chart(app.elements.rainChart, {
                type: 'bar',
                data: { labels: labels, datasets: [{ data: data.rain, backgroundColor: 'rgba(59, 130, 246, 0.6)' }] },
                options: sharedOptions
            });

            if (app.state.charts.wind) app.state.charts.wind.destroy();
            app.state.charts.wind = new Chart(app.elements.windChart, {
                type: 'line',
                data: { 
                    labels: labels, 
                    datasets: [{ 
                        data: data.wind, 
                        borderColor: '#64748b', 
                        backgroundColor: 'rgba(100, 116, 139, 0.1)', 
                        fill: true, 
                        tension: 0.4, 
                        pointRadius: 0,
                        segment: {
                            borderDash: ctx => (ctx.p1.parsed.x > nowValue ? [5, 5] : undefined),
                        }
                    }] 
                },
                options: sharedOptions
            });

            this.synchronizeCharts([app.state.charts.mainWeather, app.state.charts.rain, app.state.charts.wind]);
        },
        
        synchronizeCharts(charts) {
            charts.forEach(chart => {
                chart.canvas.addEventListener('mousemove', e => {
                    const points = chart.getElementsAtEventForMode(e, 'index', { intersect: false });
                    if (points.length > 0) {
                        const index = points[0].index;
                        charts.forEach(otherChart => {
                            if (otherChart !== chart) {
                                otherChart.tooltip.setActiveElements(otherChart.getElementsAtEventForMode(e, 'index', { intersect: false }), { x: e.offsetX, y: e.offsetY });
                                otherChart.update();
                            }
                        });
                    }
                });
            });
        },

        renderTidalChart() {
            this.setLoading(true, 'chart');
            if (!app.state.tidalData || !app.state.tidalData.minutely_15) {
                this.setLoading(false, 'chart');
                return;
            }
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            const labels = time.map(t => new Date(t));
            const now = new Date();

            if (app.state.charts.tidal) app.state.charts.tidal.destroy();
            app.state.charts.tidal = new Chart(app.elements.tidalChart, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ketinggian Permukaan Laut (m)', 
                        data: sea_level_height_msl,
                        borderColor: 'var(--pertamina-blue)', backgroundColor: 'rgba(60, 109, 178, 0.2)',
                        fill: true, tension: 0.2, pointRadius: 0, pointHoverRadius: 5,
                        segment: {
                            borderColor: ctx => (ctx.p1.parsed.x > now.valueOf() ? 'var(--pertamina-green)' : 'var(--pertamina-blue)'),
                            borderDash: ctx => (ctx.p1.parsed.x > now.valueOf() ? [5, 5] : undefined),
                        }
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        annotation: {
                            annotations: {
                                nowLine: { type: 'line', xMin: now, xMax: now, borderColor: 'var(--pertamina-red)', borderWidth: 2,
                                    label: { content: 'Sekarang', display: true, position: 'start', color: 'white', backgroundColor: 'var(--pertamina-red)', font: { weight: 'bold' } }
                                }
                            }
                        }
                    },
                    scales: {
                        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM dd, HH:mm' }, grid: { display: false } },
                        y: { title: { display: true, text: 'Ketinggian (m MSL)' }, grid: { color: '#e2e8f0' } }
                    }
                }
            });
            this.setLoading(false, 'chart');
        },

        openModal(type, stationId) {
            const station = app.config.stations.find(s => s.id === stationId);
            if (!station) return;
            const modal = document.getElementById(`${type}-modal`);
            if (type === 'history') {
                app.elements.historyModalTitle.textContent = `Riwayat & Prediksi: ${station.name}`;
                this.renderHistoryChart(station);
            } else if (type === 'cctv') {
                const stationData = app.state.stationData.find(s => s.id === stationId);
                app.elements.cctvModalTitle.textContent = `CCTV: ${station.name}`;
                this.updateCctvVisuals(stationData);
            }
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        },

        closeModal(type) { 
            const modal = document.getElementById(`${type}-modal`);
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        },
        
        renderHistoryChart(station) {
            this.setLoading(true, 'history');
            if (!app.state.tidalData || !app.state.tidalData.minutely_15) {
                this.setLoading(false, 'history');
                return;
            }
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            const labels = time.map(t => new Date(t));
            
            const stationSeaLevel = sea_level_height_msl.map(level => {
                const error = 1 + (Math.random() - 0.5) * 0.10;
                return Math.max(0, level * error);
            });

            const now = new Date();

            if (app.state.charts.history) app.state.charts.history.destroy();
            app.state.charts.history = new Chart(app.elements.historyChart, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `Ketinggian Air (m) - ${station.name}`,
                        data: stationSeaLevel,
                        borderColor: 'var(--pertamina-blue)',
                        backgroundColor: 'rgba(60, 109, 178, 0.2)',
                        fill: true, tension: 0.2, pointRadius: 0,
                        segment: {
                            borderColor: ctx => (ctx.p1.parsed.x > now.valueOf() ? 'var(--pertamina-green)' : 'var(--pertamina-blue)'),
                            borderDash: ctx => (ctx.p1.parsed.x > now.valueOf() ? [5, 5] : undefined),
                        }
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        annotation: {
                            annotations: {
                                nowLine: { type: 'line', xMin: now, xMax: now, borderColor: 'var(--pertamina-red)', borderWidth: 2,
                                    label: { content: 'Sekarang', display: true, position: 'start' }
                                }
                            }
                        }
                    },
                    scales: {
                        x: { type: 'time', time: { unit: 'day' } },
                        y: { title: { display: true, text: 'Ketinggian (m MSL)' } }
                    }
                }
            });
            this.setLoading(false, 'history');
        },
        
        updateCctvVisuals(station) {
            const maxLevel = 2.5;
            const percent = Math.min(100, (station.waterLevel / maxLevel) * 100);
            app.elements.waterLevelOverlay.style.height = `${percent}%`;
            app.elements.waterLevelText.textContent = `${station.waterLevel.toFixed(2)} m`;
            app.elements.virtualTideStaff.innerHTML = '';
            for (let i = 0; i <= maxLevel; i += 0.5) {
                const el = document.createElement('div');
                el.className = 'w-full text-right pr-2 text-xs font-mono border-t border-gray-500';
                el.style.flexBasis = `${(0.5 / maxLevel) * 100}%`;
                el.innerHTML = `<span>${i.toFixed(1)}</span>`;
                app.elements.virtualTideStaff.appendChild(el);
            }
        },
        
        getWmoCodeInfo(code) {
            const wmo = {
                0: {d: "Cerah", i: "sun"}, 1: {d: "Cerah Berawan", i: "cloud-sun"},
                2: {d: "Berawan", i: "cloud"}, 3: {d: "Sangat Berawan", i: "clouds"},
                45: {d: "Kabut", i: "cloud-fog"}, 48: {d: "Kabut Tebal", i: "cloud-fog"},
                51: {d: "Gerimis Ringan", i: "cloud-drizzle"}, 53: {d: "Gerimis Sedang", i: "cloud-drizzle"}, 55: {d: "Gerimis Lebat", i: "cloud-drizzle"},
                61: {d: "Hujan Ringan", i: "cloud-rain"}, 63: {d: "Hujan Sedang", i: "cloud-rain"}, 65: {d: "Hujan Lebat", i: "cloud-rain-wind"},
                80: {d: "Hujan Lokal", i: "cloud-lightning"}, 81: {d: "Hujan Lokal Lebat", i: "cloud-lightning"},
                95: {d: "Badai Petir", i: "zap"}, 96: {d: "Badai Petir & Hujan Es", i: "zap"}
            };
            const info = wmo[code] || { d: "Cuaca Tidak Diketahui", i: "help-circle" };
            return { description: info.d, icon: info.i };
        },

        getWindDirectionName(deg) {
            const directions = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
            const index = Math.round(deg / 45) % 8;
            return directions[index];
        },

        getStatusInfo(status) {
            const statuses = {
                Bahaya: { c: 'var(--status-bahaya)', bg: '#fee2e2', i: 'shield-alert', t: 'BAHAYA', m: 'Level air berbahaya terdeteksi di beberapa titik.'},
                Waspada: { c: 'var(--status-waspada)', bg: '#fef3c7', i: 'shield-check', t: 'WASPADA', m: 'Level air meningkat, potensi rob. Harap waspada.'},
                Aman: { c: 'var(--status-aman)', bg: '#dcfce7', i: 'shield-check', t: 'AMAN', m: 'Semua stasiun dalam kondisi normal dan terkendali.'}
            };
            const s = statuses[status];
            return { color: s.c, bgColor: s.bg, icon: s.i, text: s.t, message: s.m };
        },

        showError(message) {
            app.elements.alertTitle.textContent = "Terjadi Kesalahan";
            app.elements.alertMessage.textContent = message;
            app.elements.generalAlert.style.backgroundColor = '#fee2e2';
            app.elements.generalAlert.style.borderColor = 'var(--status-bahaya)';
            app.elements.alertIconContainer.style.backgroundColor = 'var(--status-bahaya)';
            app.elements.alertIcon.setAttribute('data-lucide', 'alert-triangle');
            lucide.createIcons();
        },

        showToast(message, type = 'info') {
            const toast = document.createElement('div');
            const colors = {
                info: 'bg-gray-700',
                success: 'bg-green-600',
                error: 'bg-red-600'
            };
            toast.className = `fixed bottom-5 right-5 text-white px-4 py-2 rounded-lg shadow-lg z-[3000] transition-opacity duration-300 ${colors[type]}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    }
};

// --- 5. DOM Ready ---
document.addEventListener('DOMContentLoaded', () => app.init());
