export function registerForecastTable(map) {
  L.Control.WeatherForecastTable = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function (map) {
      const container = L.DomUtil.create('div', 'leaflet-weather-table-control');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      container.innerHTML = `
        <div class="forecast-scroll-container" id="forecast-scroll-box">
          <table class="forecast-table">
            <tr id="forecast-row-header"></tr>
            <tr id="forecast-row-values"></tr>
          </table>
        </div>
      `;

      // Expose UI helpers on window for compatibility with existing code
      window.updateForecastTableUI = function(forecastData) {
        try {
          container.classList.add('has-data');

          const headerRow = document.getElementById('forecast-row-header');
          const valuesRow = document.getElementById('forecast-row-values');
          if (!headerRow || !valuesRow) return;

          function getColorClass(wind) {
            if (wind < 3.0)  return 'w-under-3';
            if (wind < 5.0)  return 'w-under-5';
            if (wind < 6.0)  return 'w-under-6';
            if (wind < 7.0)  return 'w-under-7';
            if (wind < 8.0)  return 'w-under-8';
            if (wind < 9.0)  return 'w-under-9';
            if (wind < 10.0) return 'w-under-10';
            if (wind < 12) return 'w-under-12';
            if (wind < 15) return 'w-under-15';
            if (wind < 20) return 'w-under-20';
            if (wind < 25) return 'w-under-25';
            return 'w-over-25';
          }

          let headerHtml = '';
          let valuesHtml = '';

          forecastData.forEach(item => {
            const colorClass = getColorClass(item.wind);
            const formattedValue = item.wind >= 10 ? Math.round(item.wind) : item.wind.toFixed(1);

            headerHtml += `<th data-time="${item.fullKey}">${item.hour}h</th>`;
            valuesHtml += `<td data-time="${item.fullKey}" class="${colorClass}">${formattedValue}</td>`;
          });

          headerRow.innerHTML = headerHtml;
          valuesRow.innerHTML = valuesHtml;

          if (window.highlightActiveForecastHour) window.highlightActiveForecastHour();

          setTimeout(() => { if (window.scrollActiveForecastHourToCenter) window.scrollActiveForecastHourToCenter(); }, 50);

        } catch (tableRenderError) {
          console.error("\uD83D\uDEA8 Error populating the forecast table:", tableRenderError.message);
        }
      };

      window.highlightActiveForecastHour = function() {
        try {
          const currentKey = (window._availableTimestamps && window._availableTimestamps[window._activeTimestampIndex]) || null;
          if (!currentKey) return;

          document.querySelectorAll('.forecast-table th, .forecast-table td').forEach(el => el.classList.remove('active-hour-column'));
          document.querySelectorAll(`.forecast-table [data-time="${currentKey}"]`).forEach(el => el.classList.add('active-hour-column'));
        } catch (e) {
          console.error("\uD83D\uDEA8 Error highlighting the table column:", e);
        }
      };

      window.scrollActiveForecastHourToCenter = function() {
        try {
          const scrollBox = document.getElementById('forecast-scroll-box');
          const activeTh = document.querySelector('.forecast-table th.active-hour-column');

          if (scrollBox && activeTh) {
            const boxWidth = scrollBox.clientWidth;
            const elementLeft = activeTh.offsetLeft;
            const elementWidth = activeTh.clientWidth;
            const targetScrollLeft = elementLeft - (boxWidth / 2) + (elementWidth / 2);
            scrollBox.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
          }
        } catch (e) {
          console.error("\uD83D\uDEA8 Error scrolling the table:", e);
        }
      };

      window.hideForecastTableUI = function() {
        container.classList.remove('has-data');
      };

      return container;
    }
  });

  L.control.weatherForecastTable = function (options) { return new L.Control.WeatherForecastTable(options); };
  L.control.weatherForecastTable().addTo(map);
}
