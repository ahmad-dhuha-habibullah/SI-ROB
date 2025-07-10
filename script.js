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
            weather: 'https://api.open-meteo.com/v1/forecast?latitude=1.685167,1.666111,1.691,0.53975&longitude=101.4785,101.500667,101.429694,101.447694&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=precipitation_probability,weather_code,temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&timezone=Asia%2FBangkok',
            tidal: 'https://marine-api.open-meteo.com/v1/marine?latitude=2.045354&longitude=101.993829&timezone=Asia%2FBangkok&past_days=0&forecast_days=2&minutely_15=sea_level_height_msl'
        },
        waterLevelThresholds: {
            bahaya: 2,
            waspada: 1.8
        },
        updateInterval: 300000, // 5 minutes
        urlPaths: {
            'beranda': 'Beranda',
            'cuaca': 'Informasi-Cuaca',
            'pasut': 'Prediksi-Pasang-Surut',
            'riwayat-banjir': 'Arsip-Banjir',
            'tentang-kami': 'Tentang-Kami'
        }
    },
    state: {
        stationData: [],
        weatherData: null,
        tidalData: null,
        map: null,
        markers: {},
        charts: {},
        selectedWeatherStationId: 0,
        selectedDate: null, // Will be set in init()
        isLoading: true,
        activeTab: 'beranda',
        dayHourlyData: {}, // Store current day's hourly data for interactions
    },
    elements: {},


    floodHistory: {
    map: null,
    geoTiffLayer: null,
    infoControl: null,
    legendControl: null,
    mapInitialized: false,
    currentLayerIndex: 0,
    intervalId: null,

    layers: [
        { url: 'geotiff_data/banjir_1/2025-03-03-00_00_2025-03-03-23_59_Sentinel-2_L2A_True_color.tiff', date: '3 Maret 2025', type: 'True Color (Banjir)'},
        { url: 'geotiff_data/banjir_1/2025-03-03-00_00_2025-03-03-23_59_Sentinel-2_L2A_NDWI.tiff', date: '3 Maret 2025', type: 'NDWI (Banjir)'},
        { url: 'geotiff_data/banjir_1/2025-03-13-00_00_2025-03-13-23_59_Sentinel-2_L2A_True_color.tiff', date: '13 Maret 2025', type: 'True Color (Pasca-Banjir)'},
        { url: 'geotiff_data/banjir_1/2025-03-13-00_00_2025-03-13-23_59_Sentinel-2_L2A_NDWI.tiff', date: '13 Maret 2025', type: 'NDWI (Pasca-Banjir)'}
    ],
    
    init() {
        if (this.map) {
            this.startSlideshow();
            return;
        }
        
        this.map = L.map('flood-map').setView([0.533, 101.44], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        this.initControls();
        this.loadAndDisplayGeoTIFF(this.layers[0]);
        this.calculateFloodArea();
        this.startSlideshow();
    },

    startSlideshow() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.cycleLayers(), 4000);
    },

    stopSlideshow() {
        clearInterval(this.intervalId);
        this.intervalId = null;
    },

    initControls() {
        this.infoControl = L.control({ position: 'topleft' });
        this.infoControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'flood-info-control');
            this.updateInfoControl(div);
            return div;
        };
        this.infoControl.addTo(this.map);

        this.legendControl = L.control({ position: 'bottomright' });
        this.legendControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'legend-control');
            div.innerHTML = `<div class="legend-wrapper"><div class="legend-colorbar"></div><div class="legend-labels"><span>Daratan</span><span>Air</span></div></div>`;
            return div;
        };
        this.legendControl.addTo(this.map);
    },
    
    updateInfoControl(div, props) {
        const container = div || this.infoControl.getContainer();
        container.innerHTML = '<h4>Informasi Citra</h4>' + (props ?
            `<b>Tanggal:</b> ${props.date}<br/><b>Tipe:</b> ${props.type}` :
            'Memuat data citra...');
    },
    
    async loadAndDisplayGeoTIFF(layerInfo) {
        try {
            this.updateInfoControl(null, { date: layerInfo.date, type: 'Memuat...' });
            const response = await fetch(layerInfo.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage();
            const bbox = image.getBoundingBox();
            const imageBounds = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]];
            
            const canvas = document.createElement('canvas');
            canvas.width = image.getWidth(); 
            canvas.height = image.getHeight();
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(canvas.width, canvas.height);
            
            if (layerInfo.type.includes('NDWI')) {
                this.legendControl.getContainer().style.display = 'block';
                const rasters = await image.readRasters();
                const ndwiData = rasters[0];
                const noDataValue = image.getGDALNoData();

                let min = Infinity, max = -Infinity;
                for (let i = 0; i < ndwiData.length; i++) {
                    const val = ndwiData[i];
                    if (val === noDataValue) continue;
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                
                // ✅ FIX: Using the correct buffered normalization from your index.html
                const range = max - min;
                const buffer = range * 0.20; // The crucial 0.2 buffer
                const bufferedMin = min - buffer;
                const bufferedMax = max + buffer;

                for (let i = 0; i < ndwiData.length; i++) {
                    let rawValue = ndwiData[i];
                    if (rawValue === noDataValue) {
                         imageData.data[i * 4 + 3] = 0;
                         continue;
                    }
                    const normalizedValue = (1 - (rawValue - bufferedMin) / (bufferedMax - bufferedMin)) * 2 - 1;
                    const [r, g, b, a] = this.ndwiColorizer(normalizedValue);
                    imageData.data[i * 4] = r; imageData.data[i * 4 + 1] = g; imageData.data[i * 4 + 2] = b; imageData.data[i * 4 + 3] = a;
                }
            } else { // True Color Image
                this.legendControl.getContainer().style.display = 'none';
                const rgbData = await image.readRasters({ interleave: true });
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = rgbData[i/4*3];
                    data[i + 1] = rgbData[i/4*3+1];
                    data[i + 2] = rgbData[i/4*3+2];
                    data[i + 3] = 255;
                }
            }
            ctx.putImageData(imageData, 0, 0);

            if (this.geoTiffLayer) this.map.removeLayer(this.geoTiffLayer);
            this.geoTiffLayer = L.imageOverlay(canvas.toDataURL(), imageBounds).addTo(this.map);
            this.updateInfoControl(null, layerInfo);

            if (!this.mapInitialized) {
                const bounds = L.latLngBounds(imageBounds);
                this.map.fitBounds(bounds);
                this.map.setMaxBounds(bounds.pad(0.1));
                this.map.options.minZoom = this.map.getZoom();
                this.mapInitialized = true;
            }
        } catch (error) {
            console.error('Error loading GeoTIFF:', error);
            this.updateInfoControl(null, { date: layerInfo.date, type: `Error: ${error.message}` });
        }
    },

    // ✅ FIX: Removed the duplicate function and kept the correct one.
    ndwiColorizer(value) {
        const blue = [0, 0, 255], white = [255, 255, 255], green = [0, 255, 0];
        if (value > 0.8) return [...blue, 255];
        if (value < -0.8) return [...green, 255];
        if (value >= 0) return this.interpolateColor(value, 0, 0.8, white, blue);
        return this.interpolateColor(value, -0.8, 0, green, white);
    },

    interpolateColor(value, min, max, startColor, endColor) {
        const ratio = (value - min) / (max - min);
        const r = Math.round(startColor[0] + ratio * (endColor[0] - startColor[0]));
        const g = Math.round(startColor[1] + ratio * (endColor[1] - startColor[1]));
        const b = Math.round(startColor[2] + ratio * (endColor[2] - startColor[2]));
        return [r, g, b, 255];
    },
    
    async calculateFloodArea() {
    const analysisElement = document.getElementById('analysis-text');
    try {
        const floodUrl = this.layers.find(l => l.date.includes('3 Maret') && l.type.includes('NDWI'))?.url;
        const postFloodUrl = this.layers.find(l => l.date.includes('13 Maret') && l.type.includes('NDWI'))?.url;

        if (!floodUrl || !postFloodUrl) {
            throw new Error("File NDWI untuk analisis tidak ditemukan.");
        }

        const [floodResponse, postFloodResponse] = await Promise.all([fetch(floodUrl), fetch(postFloodUrl)]);
        if (!floodResponse.ok || !postFloodResponse.ok) throw new Error("Gagal mengambil file NDWI.");
        
        const [floodBuffer, postFloodBuffer] = await Promise.all([floodResponse.arrayBuffer(), postFloodResponse.arrayBuffer()]);
        const [floodTiff, postFloodTiff] = await Promise.all([GeoTIFF.fromArrayBuffer(floodBuffer), GeoTIFF.fromArrayBuffer(postFloodBuffer)]);
        const [floodImage, postFloodImage] = await Promise.all([floodTiff.getImage(), postFloodTiff.getImage()]);
        
        // ✅ FIX: Using the more accurate area calculation from the original index.html
        const floodBbox = floodImage.getBoundingBox();
        const centerLat = (floodBbox[1] + floodBbox[3]) / 2;
        const resolution = floodImage.getResolution();
        // This calculates pixel area in square degrees, then converts to meters based on latitude.
        const pixelAreaDegrees = Math.abs(resolution[0] * resolution[1]);
        const metersPerDegree = 111320 * Math.cos(centerLat * Math.PI / 180);
        const pixelAreaMeters = pixelAreaDegrees * Math.pow(metersPerDegree, 2);

        const [floodRasters, postFloodRasters] = await Promise.all([floodImage.readRasters(), postFloodImage.readRasters()]);
        const floodData = floodRasters[0];
        const postFloodData = postFloodRasters[0];
        
        let affectedPixelCount = 0;
        
        // This logic uses a simple normalization and threshold to compare the two images.
        // It's a robust method for this kind of change detection.
        for(let i = 0; i < floodData.length; i++) {
            const floodNdwi = (floodData[i] / 255) * 2 - 1;
            const postFloodNdwi = (postFloodData[i] / 255) * 2 - 1;

            // Count pixels that were water during the flood (high NDWI) but became land after (low NDWI)
            if (floodNdwi > 0.5 && postFloodNdwi <= 0.5) {
                affectedPixelCount++;
            }
        }

        const affectedAreaMeters = affectedPixelCount * pixelAreaMeters;
        const affectedAreaHectares = affectedAreaMeters / 10000;
        
        analysisElement.innerHTML = `
            Estimasi luas wilayah terdampak banjir sementara adalah 
            <b class="text-pertamina-red text-lg">${affectedAreaHectares.toFixed(2)} hektar</b>.
            <br><br>
            <small class="text-gray-500">
                <b>Sumber Data:</b> Citra satelit Copernicus Sentinel-2.
                <br>
                <b>Metodologi:</b> Analisis ini menggunakan indeks <b>Normalized Difference Water Index (NDWI)</b> untuk membedakan badan air dari daratan. Dengan membandingkan citra pada saat banjir (3 Maret 2025) dan pasca-banjir (13 Maret 2025), area yang mengalami genangan sementara dapat diisolasi dan dihitung luasnya. Piksel dengan nilai <b>NDWI > 0.5</b> diklasifikasikan sebagai area tergenang.
            </small>
        `;

    } catch(e) {
        console.error("Gagal menghitung luas area banjir:", e);
        analysisElement.textContent = "Gagal melakukan analisis area.";
    }
},
    cycleLayers() {
        this.currentLayerIndex = (this.currentLayerIndex + 1) % this.layers.length;
        this.loadAndDisplayGeoTIFF(this.layers[this.currentLayerIndex]);
    }
},

    getLocalDateString(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    // --- 2. INITIALIZATION ---
    init() {
        console.log("SI-ROB Dashboard v5.3 Initializing...");
        this.state.selectedDate = this.getLocalDateString(new Date());
        this.cacheDOMElements();
        this.setupEventListeners();
        this.ui.updateClock();
        setInterval(this.ui.updateClock, 1000);
        lucide.createIcons();
        this.ui.handleInitialURL();
        this.ui.showTab('beranda', true);
        this.loadInitialData();
        this.ui.initSubscriptionPopup();
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
        }
    },
    
    cacheDOMElements() {
        const ids = [
            'mobile-menu-button', 'mobile-navigation-menu', 'desktop-navigation-menu', 'datetime', 'mobile-datetime', 'map',
            'general-alert', 'alert-icon-container', 'alert-icon', 'alert-title', 'alert-message',
            'summary-container', 'station-list', 'station-select', 'current-weather-location',
            'weather-icon-main', 'weather-description', 'weather-temp-current',
            'detail-temp', 'detail-humidity', 'detail-rain', 'detail-wind-speed', 'detail-wind-dir', 'detail-wind-name',
            'wind-direction-arrow', 'weather-chart-loader',
            'weather-temp-chart', 'weather-precip-chart', 'weather-wind-display', 'daily-forecast-container',
            'tidal-chart-container', 'tidal-chart', 'chart-loader',
            'history-modal', 'close-history-modal', 'history-modal-title', 'history-chart', 'history-chart-loader',
            'cctv-modal', 'close-cctv-modal', 'cctv-modal-title', 'water-level-overlay',
            'virtual-tide-staff', 'water-level-text',
            'download-tidal-csv',
            'subscription-modal', 'close-subscription-modal', 'subscription-form',
            'later-button', 'dont-show-again-button'
        ];
        ids.forEach(id => {
            const camelCaseId = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
            this.elements[camelCaseId] = document.getElementById(id);
        });
        
        this.elements.navTabs = document.querySelectorAll('.nav-tab');
        this.elements.tabContents = document.querySelectorAll('.tab-content');
        this.elements.stationHintPopup = document.getElementById('station-hint-popup');
        this.elements.dismissHintButton = document.getElementById('dismiss-hint-button');
    },

    setupEventListeners() {
        this.elements.navTabs.forEach(tab => tab.addEventListener('click', e => {
            e.preventDefault(); // Prevent default anchor behavior
            this.ui.showTab(e.currentTarget.dataset.tab);
        }));
        this.elements.mobileMenuButton.addEventListener('click', () => {
            const menu = this.elements.mobileNavigationMenu;
            menu.classList.toggle('hidden');
        });
        this.elements.stationSelect.addEventListener('change', e => {
            this.state.selectedWeatherStationId = parseInt(e.target.value);
            this.state.selectedDate = new Date().toISOString().slice(0, 10); // Reset to today
            this.ui.renderWeatherTab();
        });
        this.elements.closeHistoryModal.addEventListener('click', () => this.ui.closeModal('history'));
        this.elements.closeCctvModal.addEventListener('click', () => this.ui.closeModal('cctv'));
        this.elements.mobileNavigationMenu.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => this.elements.mobileNavigationMenu.classList.add('hidden'));
        });
        
        const hintDismissed = localStorage.getItem('siRobHintDismissed');
        if (!hintDismissed) {
            setTimeout(() => this.elements.stationHintPopup?.classList.add('show'), 2000);
        }
        this.elements.dismissHintButton?.addEventListener('click', () => {
            this.elements.stationHintPopup.classList.remove('show');
            localStorage.setItem('siRobHintDismissed', 'true');
        });

        // --- NEW CODE START ---
        this.elements.downloadTidalCsv.addEventListener('click', () => this.data.downloadTidalDataAsCSV());
        this.elements.closeSubscriptionModal.addEventListener('click', () => this.ui.closeModal('subscription'));
        this.elements.subscriptionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.ui.handleSubscriptionSubmit();
        });
        this.elements.laterButton.addEventListener('click', () => this.ui.closeModal('subscription'));
        this.elements.dontShowAgainButton.addEventListener('click', () => {
            this.ui.closeModal('subscription');
            localStorage.setItem('siRobSubscriptionDismissed', 'true');
            this.ui.showToast("Anda tidak akan melihat pop-up ini lagi.", "info");
        });
        window.addEventListener('popstate', (event) => {
            this.ui.handleInitialURL(); // Re-use the same logic to show the correct tab
        });
        // --- NEW CODE END ---
    },

    // --- 3. API & DATA HANDLING ---
    api: {
        async fetchWeatherData() {
            try {
                const res = await fetch(app.config.api.weather);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                app.state.weatherData = await res.json();
            } catch (e) { console.error("Error fetching weather data:", e); throw e; }
        },
        async fetchTidalData() {
            try {
                const res = await fetch(app.config.api.tidal);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                app.state.tidalData = await res.json();
            } catch (e) { console.error("Error fetching tidal data:", e); throw e; }
        }
    },

    data: {
        processAllData() {
            if (!app.state.tidalData || !app.state.tidalData.minutely_15) return;
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            const now = new Date();
            const closestTimeIndex = time.reduce((prev, curr, i) => (Math.abs(new Date(curr) - now) < Math.abs(new Date(time[prev]) - now) ? i : prev), 0);
            const currentSeaLevel = sea_level_height_msl[closestTimeIndex];
            if (isNaN(currentSeaLevel)) return;
            if (app.state.stationData.length === 0) {
                app.state.stationData = app.config.stations.map(s => ({ ...s, waterLevel: 0, status: 'Aman' }));
            }
            app.state.stationData.forEach(station => {
                const errorMargin = 1 + (Math.random() - 0.5) * 0.10;
                station.waterLevel = Math.max(0, currentSeaLevel * errorMargin);
                station.status = this.getWaterLevelStatus(station.waterLevel);
            });
        },
        getWaterLevelStatus(level) {
            if (level > app.config.waterLevelThresholds.bahaya) return "Bahaya";
            if (level > app.config.waterLevelThresholds.waspada) return "Waspada";
            return "Aman";
        },

       
        downloadTidalDataAsCSV() {
            if (!app.state.tidalData || !app.state.tidalData.minutely_15) {
                app.ui.showToast("Data pasang surut belum tersedia.", "error");
                return;
            }
        
            const { time, sea_level_height_msl } = app.state.tidalData.minutely_15;
            
            let csvContent = "data:text/csv;charset=utf-8," 
                           + '"Waktu","Ketinggian Permukaan Laut (m)"\n';
            
            time.forEach((t, index) => {
                const formattedTime = t.replace('T', ' ');
                const row = `"${formattedTime}","${sea_level_height_msl[index]}"\n`;
                csvContent += row;
            });
        
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "prediksi_pasang_surut.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            app.ui.showToast("Unduhan CSV dimulai...", "success");
        }

    },
    
    // --- 4. UI & RENDERING ---
    ui: {
        updateFullUI() {
            if (app.state.isLoading) return;
            this.updateGeneralAlert();
            this.updateSummary();
            this.updateStationList();
            this.updateMapMarkers();
            this.renderActiveTab();
        },
        
        renderActiveTab() {
            if (app.state.activeTab === 'cuaca') this.renderWeatherTab();
            if (app.state.activeTab === 'pasut') this.renderTidalChart();
        },

        setLoading(isLoading, scope = 'chart') {
            app.state.isLoading = isLoading;
            const display = isLoading ? 'flex' : 'none';
            const loader = app.elements.weatherChartLoader;
            if (scope === 'all' || scope === 'weather') {
                loader.classList.toggle('hidden', !isLoading);
            }
            app.elements.chartLoader.style.display = (scope === 'all' || scope === 'chart') ? display : 'none';
            app.elements.historyChartLoader.style.display = (scope === 'all' || scope === 'history') ? display : 'none';
        },

        updateClock() {
            const now = new Date();
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' };
            const timeString = now.toLocaleDateString('id-ID', options).replace(/\./g, ':');
            app.elements.datetime.textContent = timeString;
            app.elements.mobileDatetime.textContent = timeString;
        },

            handleInitialURL() {
            const path = window.location.hash.substring(1) || 'Beranda';
            let tabIdToShow = 'beranda'; // Default tab

            for (const id in app.config.urlPaths) {
            if (decodeURIComponent(app.config.urlPaths[id]) === decodeURIComponent(path)) {
            tabIdToShow = id;
            break;
            }
            }
            this.showTab(tabIdToShow, true);
        },
        
    showTab(tabId, isInitial = false) {
            if (!isInitial && app.state.activeTab === tabId) return;

            if(app.state.activeTab === 'riwayat-banjir') app.floodHistory.stopSlideshow();

            app.state.activeTab = tabId;

            app.elements.tabContents.forEach(c => c.classList.add('hidden'));
            app.elements.navTabs.forEach(t => t.classList.remove('active'));

            document.getElementById(`${tabId}-content`).classList.remove('hidden');
            document.querySelectorAll(`.nav-tab[data-tab="${tabId}"]`).forEach(t => t.classList.add('active'));

            if (!app.state.isLoading) this.renderActiveTab();

            if (tabId === 'beranda' && app.state.map) {
                setTimeout(() => app.state.map.invalidateSize(), 100);
            }
            else if (tabId === 'riwayat-banjir') {
                app.floodHistory.init();
                setTimeout(() => { if (app.floodHistory.map) app.floodHistory.map.invalidateSize() }, 100);
            }

            // Update URL if not an initial load
            if (!isInitial) {
                const path = app.config.urlPaths[tabId] || 'Beranda';
                const newUrl = `${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/${path}`;
                window.location.hash = path;
            }
        },
        
        initializeMap() { if (app.state.map) return; app.state.map = L.map(app.elements.map).setView([1.2, 101.45], 9); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(app.state.map); app.config.stations.forEach(s => { app.state.markers[s.id] = L.marker(s.coords).addTo(app.state.map); }); },
        updateMapMarkers() { if (!app.state.map || app.state.stationData.length === 0) return; app.state.stationData.forEach(station => { const marker = app.state.markers[station.id]; const statusInfo = this.getStatusInfo(station.status); marker.setIcon(this.createMarkerIcon(statusInfo.color)); marker.unbindPopup().bindPopup(this.createPopupContent(station, statusInfo)); }); },
        createMarkerIcon(color) { const html = `<div class="relative flex justify-center items-center"><div class="pulse" style="background-color: ${color};"></div><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="relative map-marker-svg"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`; return L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 28] }); },
        createPopupContent(station, statusInfo) { const container = document.createElement('div'); container.innerHTML = `<div class="popup-title">${station.name}</div><div class="text-sm space-y-1"><div class="flex justify-between"><span>Status:</span> <strong style="color: ${statusInfo.color};">${station.status}</strong></div><div class="flex justify-between"><span>Ketinggian:</span> <strong>${station.waterLevel.toFixed(2)} m</strong></div></div><div class="mt-3 flex space-x-2"><button class="popup-button popup-button-primary flex-1" data-action="history">Riwayat</button><button class="popup-button popup-button-secondary flex-1" data-action="cctv">CCTV</button></div>`; container.querySelector('[data-action="history"]').addEventListener('click', () => this.openModal('history', station.id)); container.querySelector('[data-action="cctv"]').addEventListener('click', () => this.openModal('cctv', station.id)); return container; },
        updateGeneralAlert() { const counts = app.state.stationData.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {}); const overallStatus = counts.Bahaya > 0 ? "Bahaya" : counts.Waspada > 0 ? "Waspada" : "Aman"; const info = this.getStatusInfo(overallStatus); app.elements.alertIcon.setAttribute('data-lucide', info.icon); app.elements.alertTitle.textContent = `Status Peringatan: ${info.text}`; app.elements.alertMessage.textContent = info.message; app.elements.generalAlert.style.backgroundColor = info.bgColor; app.elements.generalAlert.style.borderColor = info.color; app.elements.generalAlert.classList.add('border-l-4'); app.elements.alertIconContainer.style.backgroundColor = info.color; lucide.createIcons({ nodes: [app.elements.alertIcon] }); },
        updateSummary() { if (!app.state.weatherData || !app.state.tidalData?.minutely_15) return; const stationWeather = app.state.weatherData[app.state.selectedWeatherStationId]; const { hourly } = stationWeather; const weatherIdx = hourly.time.findIndex(t => new Date(t) > new Date()); if (weatherIdx === -1) return; const maxTide = Math.max(...app.state.tidalData.minutely_15.sea_level_height_msl.slice(0, 4 * 48)); app.elements.summaryContainer.innerHTML = `<div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="thermometer" class="w-4 h-4 mr-2 text-gray-500"></i>Suhu Udara</span><span class="font-bold">${hourly.temperature_2m[weatherIdx]}°C</span></div><div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="wind" class="w-4 h-4 mr-2 text-gray-500"></i>Kecepatan Angin</span><span>${hourly.wind_speed_10m[weatherIdx]} km/j</span></div><div class="flex justify-between items-center"><span class="font-semibold flex items-center"><i data-lucide="waves" class="w-4 h-4 mr-2 text-gray-500"></i>Pasang Tertinggi (48j)</span><span class="font-bold text-pertamina-blue">${maxTide.toFixed(2)} m</span></div>`; lucide.createIcons({ nodes: app.elements.summaryContainer.querySelectorAll('[data-lucide]') }); },
        updateStationList() { app.elements.stationList.innerHTML = ''; app.state.stationData.forEach(station => { const statusInfo = this.getStatusInfo(station.status); const item = document.createElement('div'); item.className = 'flex justify-between items-center p-2.5 rounded-md hover:bg-gray-50 cursor-pointer border-l-4'; item.style.borderColor = statusInfo.color; item.onclick = () => app.state.map.setView(station.coords, 14); item.innerHTML = `<div><p class="font-semibold">${station.name}</p><p class="text-xs text-gray-500">Ketinggian: ${station.waterLevel.toFixed(2)} m</p></div><span class="px-2 py-1 text-xs font-bold text-white rounded-full" style="background-color: ${statusInfo.color};">${station.status}</span>`; app.elements.stationList.appendChild(item); }); },
        populateStationDropdown() { app.elements.stationSelect.innerHTML = ''; app.config.stations.forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; app.elements.stationSelect.appendChild(opt); }); },
        
        updateWeatherDisplayForHour(index) {
            const hourlyData = app.state.dayHourlyData;
            if (!hourlyData || hourlyData.time[index] === undefined) return;
        
            const time = new Date(hourlyData.time[index]);
            const wmoInfo = this.getWmoCodeInfo(hourlyData.weather_code[index]);
        
            app.elements.weatherTempCurrent.textContent = `${hourlyData.temperature_2m[index].toFixed(1)}°C`;
            app.elements.weatherIconMain.setAttribute('data-lucide', wmoInfo.icon);
            app.elements.weatherDescription.textContent = wmoInfo.description;
        
            app.elements.detailTemp.textContent = `${hourlyData.temperature_2m[index].toFixed(1)}°C`;
            app.elements.detailHumidity.textContent = `${hourlyData.relative_humidity_2m[index]}%`;
            app.elements.detailRain.textContent = `${hourlyData.precipitation[index].toFixed(2)} mm`;
            app.elements.detailWindSpeed.textContent = `${hourlyData.wind_speed_10m[index]} km/j`;
            const windDir = hourlyData.wind_direction_10m[index];
            app.elements.detailWindDir.textContent = `${windDir}°`;
            app.elements.windDirectionArrow.style.transform = `rotate(${windDir + 135}deg)`;
            app.elements.detailWindName.textContent = this.getWindDirectionName(windDir);
        
            const timeString = time.toLocaleTimeString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
            app.elements.currentWeatherLocation.innerHTML = `<span class="font-bold">${app.config.stations[app.state.selectedWeatherStationId].name}</span> <br> <span class="text-base font-normal">${timeString}</span>`;
        
            lucide.createIcons({ nodes: [app.elements.weatherIconMain] });
        },
        
        renderHourlyForecastsForDate(dateString) {
            app.state.selectedDate = dateString;
            const stationWeather = app.state.weatherData[app.state.selectedWeatherStationId];
            const { hourly } = stationWeather;
        
            // Find the start and end index for the selected date's 24-hour forecast
            const startIndex = hourly.time.findIndex(t => t.startsWith(dateString));
            if (startIndex === -1) {
                console.error("No data found for the selected date:", dateString);
                return; // Exit if no data for this day
            }
            const endIndex = startIndex + 24;
        
            // Store the 24-hour forecast for the selected day
            app.state.dayHourlyData = Object.keys(hourly).reduce((acc, key) => {
                acc[key] = hourly[key].slice(startIndex, endIndex);
                return acc;
            }, {});
            
            let initialDisplayIndex = 0; // Default to the first hour of the day (00:00)
            
            // If the selected date is today, find the current hour to display first
            if (dateString === app.getLocalDateString(new Date())) {
                const now = new Date();
                // Find the first forecast time that is greater than or equal to the current time
                const futureIndex = app.state.dayHourlyData.time.findIndex(t => new Date(t) >= now);
                initialDisplayIndex = (futureIndex !== -1) ? futureIndex : 23; // Use found index or last hour
            }
        
            // Update the main weather display and the hourly charts
            this.updateWeatherDisplayForHour(initialDisplayIndex);
            
            const forecastTimes = app.state.dayHourlyData.time.map(t => new Date(t));
            this.renderTemperatureForecast(forecastTimes, app.state.dayHourlyData.temperature_2m);
            this.renderPrecipitationForecast(forecastTimes, app.state.dayHourlyData.precipitation_probability);
            this.renderWindForecast(forecastTimes, app.state.dayHourlyData.wind_speed_10m, app.state.dayHourlyData.wind_direction_10m);
        },
        
        renderWeatherTab() {
            this.setLoading(true, 'weather');
            if (!app.state.weatherData) { this.setLoading(false, 'weather'); return; }
        
            const station = app.config.stations[app.state.selectedWeatherStationId];
            app.elements.currentWeatherLocation.textContent = station.name;
        
            this.renderDailyForecast(app.state.weatherData[app.state.selectedWeatherStationId].daily);
            this.renderHourlyForecastsForDate(app.state.selectedDate);
        
            this.setLoading(false, 'weather');
        },

        renderDailyForecast(dailyData) {
            const container = app.elements.dailyForecastContainer;
            if (!container || !dailyData) return;
            container.innerHTML = '';
        
            dailyData.time.forEach((dateString, i) => {
                const wmoInfo = this.getWmoCodeInfo(dailyData.weather_code[i]);
                const isActive = (dateString === app.state.selectedDate) ? 'active' : '';
                container.innerHTML += `
                    <div class="daily-forecast-item ${isActive}" data-date="${dateString}">
                        <div class="daily-forecast-day">${new Date(dateString).toLocaleDateString('id-ID', { weekday: 'short' })}</div>
                        <div class="daily-forecast-icon">
                            <i data-lucide="${wmoInfo.icon}" class="w-8 h-8 mx-auto" style="color:${wmoInfo.color};"></i>
                        </div>
                        <div class="daily-forecast-caption">${wmoInfo.description}</div>
                        <div class="daily-forecast-temps">
                            <span>${Math.round(dailyData.temperature_2m_max[i])}°</span>
                            <span class="low-temp">${Math.round(dailyData.temperature_2m_min[i])}°</span>
                        </div>
                    </div>
                `;
            });
    
            if (!container.dataset.listenerAttached) {
                container.addEventListener('click', (e) => {
                    const item = e.target.closest('.daily-forecast-item');
                    if (item && item.dataset.date !== app.state.selectedDate) {
                        this.setLoading(true, 'weather');
                        container.querySelector('.daily-forecast-item.active')?.classList.remove('active');
                        item.classList.add('active');
                        this.renderHourlyForecastsForDate(item.dataset.date);
                        this.setLoading(false, 'weather');
                    }
                });
                container.dataset.listenerAttached = 'true';
            }
            lucide.createIcons({ nodes: container.querySelectorAll('[data-lucide]') });
        },
        
        renderTemperatureForecast(labels, tempData) {
            const canvas = app.elements.weatherTempChart;
            if (!canvas) return;
            
            const isMobile = window.innerWidth < 768;
            const maxTemp = Math.max(...tempData);

            if (app.state.charts.weatherTemp) app.state.charts.weatherTemp.destroy();
            app.state.charts.weatherTemp = new Chart(canvas, {
                type: 'line',
                data: { labels, datasets: [{ data: tempData, borderColor: 'rgb(245, 158, 11)', backgroundColor: 'rgba(245, 158, 11, 0.2)', fill: true, tension: 0.4, pointRadius: 1, pointHoverRadius: 5 }] },
                plugins: [ChartDataLabels],
                options: {
                    responsive: true, maintainAspectRatio: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) this.updateWeatherDisplayForHour(elements[0].index);
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: true, mode: 'index', intersect: false, displayColors: false, callbacks: { title:() => '', label: (c) => `${c.parsed.y.toFixed(1)} °C` } },
                        datalabels: {
                            display: (context) => !isMobile || (context.dataIndex % 3 === 0),
                            align: 'top',
                            color: '#374151',
                            font: { weight: 'bold' },
                            formatter: (value) => `${Math.round(value)}°`
                        }
                    },
                    scales: {
                        x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } }, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                        y: { grid: { color: '#e9ecef' }, ticks: { padding: 10, callback: (v) => `${v}°` }, max: Math.ceil(maxTemp) + 2 }
                    }
                }
            });
        },

        renderPrecipitationForecast(labels, rainProbData) {
            const canvas = app.elements.weatherPrecipChart;
            if (!canvas) return;
        
            const highChanceColor = 'rgba(186, 49, 59, 0.9)';
            const defaultColor = 'rgba(60, 109, 178, 0.7)';
            const backgroundColors = rainProbData.map(p => p > 75 ? highChanceColor : defaultColor);

            if (app.state.charts.weatherPrecip) app.state.charts.weatherPrecip.destroy();
            app.state.charts.weatherPrecip = new Chart(canvas, {
                type: 'bar',
                data: { labels, datasets: [{ data: rainProbData, backgroundColor: backgroundColors, borderWidth: 0, borderRadius: 4, barPercentage: 0.5 }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    onClick: (event, elements) => {
                        if (elements.length > 0) this.updateWeatherDisplayForHour(elements[0].index);
                    },
                    plugins: { legend: { display: false }, tooltip: { enabled: true, displayColors: false, callbacks: { title: () => '', label: (c) => `${c.parsed.y}% chance` } } },
                    scales: {
                        x: { type: 'time', time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } }, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                        y: { beginAtZero: true, max: 100, grid: { color: '#e9ecef' }, ticks: { callback: (v) => `${v}%` } }
                    }
                }
            });
        },

        renderWindForecast(labels, windSpeedData, windDirData) {
            const container = app.elements.weatherWindDisplay;
            if (!container) return;
            container.innerHTML = '';
        
            labels.forEach((time, index) => {
                const item = document.createElement('div');
                item.className = 'wind-forecast-item';
                item.innerHTML = `
                    <div class="wind-forecast-time">${time.toLocaleTimeString('id-ID', { hour: '2-digit' })}:00</div>
                    <i data-lucide="navigation" class="wind-forecast-arrow" style="transform: rotate(${windDirData[index] + 135}deg);"></i>
                    <div class="wind-forecast-speed">${windSpeedData[index].toFixed(0)} km/j</div>
                `;
                item.addEventListener('click', () => this.updateWeatherDisplayForHour(index));
                container.appendChild(item);
            });
            lucide.createIcons({ nodes: container.querySelectorAll('[data-lucide]') });
        },
        
        getWmoCodeInfo(code) {
            let d = "Cuaca Tidak Diketahui", i = "help-circle", c = "#64748b"; 
            if ([0, 1].includes(code)) { d = "Cerah"; i = "sun"; c = "#f59e0b"; }
            if ([2].includes(code)) { d = "Berawan"; i = "cloud-sun"; c = "#f59e0b"; }
            if ([3].includes(code)) { d = "Sangat Berawan"; i = "cloud"; c = "#94a3b8"; }
            if ([45, 48].includes(code)) { d = "Kabut"; i = "cloud-fog"; c = "#a1a1aa"; }
            if (code >= 51 && code <= 67) { d = "Hujan"; i = "cloud-rain"; c = "#3b82f6"; }
            if (code >= 80 && code <= 82) { d = "Hujan Lokal"; i = "cloud-lightning"; c = "#3b82f6"; }
            if (code >= 95 && code <= 99) { d = "Badai Petir"; i = "zap"; c = "#8b5cf6"; }
            return { description: d, icon: i, color: c };
        },

        getWindDirectionName(deg) { const dirs = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut']; return dirs[Math.round(deg / 45) % 8]; },
        getStatusInfo(status) { const s = { Bahaya: { c: 'var(--status-bahaya)', bg: '#fee2e2', i: 'shield-alert', t: 'BAHAYA', m: 'Level air berbahaya terdeteksi.'}, Waspada: { c: 'var(--status-waspada)', bg: '#fef3c7', i: 'shield-check', t: 'WASPADA', m: 'Level air meningkat, harap waspada.'}, Aman: { c: 'var(--status-aman)', bg: '#dcfce7', i: 'shield-check', t: 'AMAN', m: 'Semua stasiun dalam kondisi normal.'}}[status]; return { color: s.c, bgColor: s.bg, icon: s.i, text: s.t, message: s.m }; },
        showError(message) { const a = app.elements; a.alertTitle.textContent = "Terjadi Kesalahan"; a.alertMessage.textContent = message; a.generalAlert.style.backgroundColor = '#fee2e2'; a.generalAlert.style.borderColor = 'var(--status-bahaya)'; a.alertIconContainer.style.backgroundColor = 'var(--status-bahaya)'; a.alertIcon.setAttribute('data-lucide', 'alert-triangle'); lucide.createIcons(); },
        showToast(message, type = 'info') { const t = document.createElement('div'); const c = { info: 'bg-gray-700', success: 'bg-green-600', error: 'bg-red-600' }; t.className = `fixed bottom-5 right-5 text-white px-4 py-2 rounded-lg shadow-lg z-[3000] transition-opacity duration-300 ${c[type]}`; t.textContent = message; document.body.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000); },
        renderTidalChart() { this.setLoading(true,'chart');if(!app.state.tidalData?.minutely_15){this.setLoading(false,'chart');return;}const{time,sea_level_height_msl}=app.state.tidalData.minutely_15;const labels=time.map(t=>new Date(t));const now=new Date();if(app.state.charts.tidal)app.state.charts.tidal.destroy();app.state.charts.tidal=new Chart(app.elements.tidalChart,{type:'line',data:{labels,datasets:[{label:'Ketinggian Permukaan Laut (m)',data:sea_level_height_msl,borderColor:'var(--pertamina-blue)',backgroundColor:'rgba(60, 109, 178, 0.2)',fill:true,tension:0.2,pointRadius:0,pointHoverRadius:5,segment:{borderColor:ctx=>(ctx.p1.parsed.x>now.valueOf()?'var(--pertamina-green)':'var(--pertamina-blue)'),borderDash:ctx=>(ctx.p1.parsed.x>now.valueOf()?[5,5]:undefined)}}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},annotation:{annotations:{nowLine:{type:'line',xMin:now,xMax:now,borderColor:'var(--pertamina-red)',borderWidth:2,label:{content:'Sekarang',display:true,position:'start',color:'white',backgroundColor:'var(--pertamina-red)',font:{weight:'bold'}}}}}},scales:{x:{type:'time',time:{unit:'hour',displayFormats:{hour:'dd-MMM HH:mm'}},grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:4}},y:{title:{display:true,text:'Ketinggian (m MSL)'},grid:{color:'#e2e8f0'}}}}});this.setLoading(false,'chart');},
        
        closeModal(type) {
            const modal = document.getElementById(`${type}-modal`);
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        },
        renderHistoryChart(station){this.setLoading(true,'history');if(!app.state.tidalData?.minutely_15){this.setLoading(false,'history');return;}const{time,sea_level_height_msl}=app.state.tidalData.minutely_15;const labels=time.map(t=>new Date(t));const stationSeaLevel=sea_level_height_msl.map(level=>{const error=1+(Math.random()-0.5)*0.10;return Math.max(0,level*error);});const now=new Date();if(app.state.charts.history)app.state.charts.history.destroy();app.state.charts.history=new Chart(app.elements.historyChart,{type:'line',data:{labels,datasets:[{label:`Ketinggian Air (m) - ${station.name}`,data:stationSeaLevel,borderColor:'var(--pertamina-blue)',backgroundColor:'rgba(60, 109, 178, 0.2)',fill:true,tension:0.2,pointRadius:0,segment:{borderColor:ctx=>(ctx.p1.parsed.x>now.valueOf()?'var(--pertamina-green)':'var(--pertamina-blue)'),borderDash:ctx=>(ctx.p1.parsed.x>now.valueOf()?[5,5]:undefined)}}]},options:{responsive:true,maintainAspectRatio:false,plugins:{annotation:{annotations:{nowLine:{type:'line',xMin:now,xMax:now,borderColor:'var(--pertamina-red)',borderWidth:2,label:{content:'Sekarang',display:true,position:'start'}}}}},scales:{x:{type:'time',time:{unit:'day'}},y:{title:{display:true,text:'Ketinggian (m MSL)'}}}}});this.setLoading(false,'history');},
        updateCctvVisuals(station){const maxLevel=2.5;const percent=Math.min(100,(station.waterLevel/maxLevel)*100);app.elements.waterLevelOverlay.style.height=`${percent}%`;app.elements.waterLevelText.textContent=`${station.waterLevel.toFixed(2)} m`;app.elements.virtualTideStaff.innerHTML='';for(let i=0;i<=maxLevel;i+=0.5){const el=document.createElement('div');el.className='w-full text-right pr-2 text-xs font-mono border-t border-gray-500';el.style.flexBasis=`${(0.5/maxLevel)*100}%`;el.innerHTML=`<span>${i.toFixed(1)}</span>`;app.elements.virtualTideStaff.appendChild(el);}},
    
        initSubscriptionPopup() {
            const dismissed = localStorage.getItem('siRobSubscriptionDismissed');
            if (!dismissed) {
                setTimeout(() => {
                    this.openModal('subscription');
                }, 5000); // Show popup after 5 seconds
            }
        },
    
        openModal(type, stationId) {
            const station = app.config.stations.find(s => s.id === stationId);
            const modal = document.getElementById(`${type}-modal`);
            if (!modal) return;
    
            if (type === 'history') {
                if (!station) return;
                app.elements.historyModalTitle.textContent = `Riwayat & Prediksi: ${station.name}`;
                this.renderHistoryChart(station);
            } else if (type === 'cctv') {
                if (!station) return;
                const stationData = app.state.stationData.find(s => s.id === stationId);
                app.elements.cctvModalTitle.textContent = `CCTV: ${station.name}`;
                this.updateCctvVisuals(stationData);
            }
            
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            if (type === 'subscription') {
                lucide.createIcons();
            }
        },
    
        async handleSubscriptionSubmit() { // Make the function async
            const email = document.getElementById('sub-email').value;
            const phone = document.getElementById('sub-phone').value;
            
            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
                this.showToast("Silakan masukkan alamat email yang valid.", "error");
                return;
            }

            try {
                // Send the data to your Formspree endpoint
                const response = await fetch('https://formspree.io/f/xkgbdoka', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, phone }),
                });

                if (!response.ok) {
                    // If the server responds with an error, show it to the user.
                    throw new Error('Server responded with an error.');
                }

                // If successful, save the state and notify the user.
                localStorage.setItem('siRobSubscriptionDismissed', 'true');
                this.closeModal('subscription');
                this.showToast("Terima kasih! Anda akan mendapatkan notifikasi.", "success");

            } catch (error) {
                // If the network request fails, show an error.
                console.error("Subscription submission failed:", error);
                this.showToast("Gagal mengirimkan data. Coba lagi nanti.", "error");
            }
        }
    },

};

document.addEventListener('DOMContentLoaded', () => app.init());