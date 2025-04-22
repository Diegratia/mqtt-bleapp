import Chart from "chart.js/auto";

const ctx = document.getElementById("dimensions").getContext("2d");

const chart = new Chart(ctx, {
  type: "bubble",
  data: {
    datasets: [
      {
        label: "RSSI Beacon",
        data: [],
        backgroundColor: "rgba(75, 192, 192, 0.6)",
      },
    ],
  },
  options: {
    scales: {
      responsive: true,
      x: {
        title: {
          display: true,
          text: "Beacon ID (numeric)",
        },
      },
      y: {
        title: {
          display: true,
          text: "RSSI Value",
        },
      },
    },
  },
});

async function fetchDataFromDatabase() {
  try {
    const response = await fetch("http://localhost:3000/rssi-chart-data");

    const result = await response.json();

    console.log("Received from API:", result);

    const beaconData = result.data;

    chart.data.datasets[0].data = beaconData.map((item, dmac) => ({
      x: dmac,
      y: item.rssi,
      r: 2,
    }));

    chart.update();
  } catch (error) {
    console.error("Error fetching data from database:", error);
  }
}

fetchDataFromDatabase();

// setInterval(fetchDataFromDatabase, 2000);
