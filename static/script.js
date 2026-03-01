document.addEventListener('DOMContentLoaded', () => {
    const cityInput = document.getElementById('city-input');
    const searchBtn = document.getElementById('search-btn');
    const locationBtn = document.getElementById('location-btn');
    const favoriteBtn = document.getElementById('favorite-btn');
    const homeBtn = document.getElementById('home-btn');
    const weatherInfo = document.getElementById('weather-info');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const favoritesList = document.getElementById('favorites-list');
    const alertBanner = document.getElementById('alert-banner');
    const alertMsg = document.getElementById('alert-msg');
    const forecastContainer = document.getElementById('forecast-container');

    // UI Elements
    const tempValue = document.getElementById('temp-value');
    const cityName = document.getElementById('city-name');
    const weatherDesc = document.getElementById('weather-desc');
    const weatherIcon = document.getElementById('weather-icon');
    const feelsLike = document.getElementById('feels-like');
    const humidity = document.getElementById('humidity');
    const windSpeed = document.getElementById('wind-speed');
    const tempRange = document.getElementById('temp-range');

    let currentCity = "";
    let chartInstance = null;

    const fetchWeather = async (params) => {
        showLoading();
        hideError();
        hideWeather();
        alertBanner.classList.add('hidden');

        const queryString = new URLSearchParams(params).toString();
        try {
            const response = await fetch(`/weather?${queryString}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to fetch weather');

            currentCity = data.city;
            updateUI(data);
            checkAlerts(data);
            checkFavoriteStatus(data.city);
            checkHomeStatus(data.city);
            fetchForecast(data.city);

        } catch (error) {
            showError(error.message);
        } finally {
            hideLoading();
        }
    };

    const fetchForecast = async (city) => {
        try {
            const response = await fetch(`/forecast?city=${city}`);
            const data = await response.json();
            if (response.ok) {
                renderForecast(data.list);
                renderChart(data.list);
            }
        } catch (error) { console.error(error); }
    };

    const updateUI = (data) => {
        tempValue.textContent = `${data.temp}°C`;
        cityName.textContent = `${data.city}, ${data.country}`;
        weatherDesc.textContent = data.description;
        weatherIcon.src = `https://openweathermap.org/img/wn/${data.icon}@4x.png`;
        feelsLike.textContent = `${data.feels_like}°C`;
        humidity.textContent = `${data.humidity}%`;
        windSpeed.textContent = `${data.wind} m/s`;
        tempRange.textContent = `${data.temp_max}° / ${data.temp_min}°`;

        updateBackground(data.description);
        showWeather();
    };

    const checkAlerts = (data) => {
        const desc = data.description.toLowerCase();
        let alertText = "";
        if (desc.includes('storm')) alertText = "Severe Weather Alert: Storms detected.";
        else if (data.temp > 35) alertText = "Heat Advisory: Extreme high temperatures.";
        
        if (alertText) {
            alertMsg.textContent = alertText;
            alertBanner.classList.remove('hidden');
        }
    };

    const renderForecast = (list) => {
        forecastContainer.innerHTML = '';
        const daily = list.filter((item, index) => index % 8 === 0).slice(0, 5);
        daily.forEach(item => {
            const date = new Date(item.dt * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
            const card = document.createElement('div');
            card.className = 'forecast-card';
            card.innerHTML = `
                <p style="font-weight: 600;">${date}</p>
                <img src="https://openweathermap.org/img/wn/${item.weather[0].icon}.png">
                <p style="font-weight: 700;">${Math.round(item.main.temp)}°</p>
            `;
            forecastContainer.appendChild(card);
        });
    };

    const renderChart = (list) => {
        const ctx = document.getElementById('temp-chart').getContext('2d');
        const next24 = list.slice(0, 8);
        const labels = next24.map(item => new Date(item.dt * 1000).getHours() + ':00');
        const temps = next24.map(item => item.main.temp);

        if (chartInstance) chartInstance.destroy();

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature',
                    data: temps,
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#fff' } },
                    y: { ticks: { color: '#fff' } }
                }
            }
        });
    };

    const updateBackground = (desc) => {
        const bg = document.getElementById('weather-bg');
        bg.innerHTML = '';
        desc = desc.toLowerCase();
        if (desc.includes('rain')) {
            for (let i = 0; i < 100; i++) {
                const drop = document.createElement('div');
                drop.className = 'raindrop';
                drop.style.left = Math.random() * 100 + 'vw';
                drop.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
                bg.appendChild(drop);
            }
        }
    };

    const fetchFavorites = async () => {
        const res = await fetch('/get_cities');
        const cities = await res.json();
        favoritesList.innerHTML = '';
        cities.forEach(city => {
            const div = document.createElement('div');
            div.className = 'favorite-item';
            div.innerHTML = `<span>${city}</span>`;
            div.onclick = () => fetchWeather({ city });
            favoritesList.appendChild(div);
        });
    };

    favoriteBtn.onclick = async () => {
        if (!currentCity) return;
        await fetch('/add_city', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city: currentCity })
        });
        fetchFavorites();
    };

    const checkFavoriteStatus = async (city) => {
        const res = await fetch('/get_cities');
        const cities = await res.json();
        favoriteBtn.classList.toggle('active', cities.includes(city));
    };

    // --- Home/Default City Logic ---
    homeBtn.onclick = () => {
        if (!currentCity) return;
        localStorage.setItem('default_city', currentCity);
        checkHomeStatus(currentCity);
        alert(`${currentCity} set as your default city!`);
    };

    const checkHomeStatus = (city) => {
        const savedHome = localStorage.getItem('default_city');
        homeBtn.classList.toggle('active', savedHome === city);
    };

    searchBtn.onclick = () => {
        const city = cityInput.value.trim();
        if (city) fetchWeather({ city });
    };

    const fetchLocationByIP = async () => {
        try {
            // Using freeipapi.com for better accuracy
            const res = await fetch('https://freeipapi.com/api/json');
            const data = await res.json();
            if (data.cityName) {
                fetchWeather({ city: data.cityName });
            } else {
                throw new Error("IP Geolocation failed");
            }
        } catch (error) {
            fetchWeather({ city: 'Hyderabad' }); // Final fallback
        } finally {
            hideLoading();
        }
    };

    locationBtn.onclick = () => {
        if (navigator.geolocation) {
            showLoading();
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                },
                (error) => {
                    fetchLocationByIP();
                },
                { enableHighAccuracy: false, timeout: 5000, maximumAge: Infinity }
            );
        } else {
            fetchLocationByIP();
        }
    };

    const showLoading = () => loading.classList.remove('hidden');
    const hideLoading = () => loading.classList.add('hidden');
    const showWeather = () => weatherInfo.classList.remove('hidden');
    const hideWeather = () => weatherInfo.classList.add('hidden');
    const showError = (msg) => {
        errorText.textContent = msg;
        errorMessage.classList.remove('hidden');
    };
    const hideError = () => errorMessage.classList.add('hidden');

    // --- Init App ---
    fetchFavorites();
    const savedHome = localStorage.getItem('default_city');
    if (savedHome) {
        fetchWeather({ city: savedHome });
    } else {
        fetchWeather({ city: 'Hyderabad' });
    }
});
