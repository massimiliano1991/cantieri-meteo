require("dotenv").config();
const fetch = require("node-fetch");

const API_KEY = process.env.API_KEY;
const WEATHERBIT_KEY = process.env.WEATHERBIT_KEY;
// 🌦️ 4. Recupero meteo da OpenWeatherMap
async function getMeteoOWM(lat, lon, dataCantiere) {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&lang=it&units=metric`;
  const res = await fetch(url);
  const data = await res.json();

  const eventi = [];

  data.list.forEach(item => {
    if (item.dt_txt.startsWith(dataCantiere)) {
      const ora = item.dt_txt.split(" ")[1].slice(0, 5);
      const oraInt = parseInt(ora.split(":")[0]);

      if (oraInt >= 6 && oraInt <= 17) {
        const tipo = item.weather[0].main.toLowerCase();
        const mm = tipo === "rain" ? item.rain?.["3h"] || 0 : tipo === "snow" ? item.snow?.["3h"] || 0 : 0;

        if (["rain", "snow", "drizzle"].includes(tipo) && mm >= 0.5) {
          eventi.push({ fonte: "OpenWeatherMap", tipo, ora, mm });
        }
      }
    }
  });

  return eventi;
}
// 🌦️ 5. Recupero meteo da Weatherbit
async function getMeteoWeatherbit(lat, lon, dataCantiere) {
  const url = `https://api.weatherbit.io/v2.0/forecast/hourly?lat=${lat}&lon=${lon}&key=${WEATHERBIT_KEY}&hours=48`;
  const res = await fetch(url);
  const data = await res.json();

  const eventi = [];

  data.data.forEach(item => {
    const giorno = item.timestamp_local.split("T")[0];
    const ora = item.timestamp_local.split("T")[1].slice(0, 5);
    const oraInt = parseInt(ora.split(":")[0]);

    if (giorno === dataCantiere && oraInt >= 6 && oraInt <= 17 && item.precip >= 0.5) {
      eventi.push({ fonte: "Weatherbit", tipo: "pioggia", ora, mm: item.precip });
    }
  });

  return eventi;
}
module.exports = {
  getMeteoOWM,
  getMeteoWeatherbit
};