// index.js
const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./database");
const { startMqttClient } = require("./mqtt");
const {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeRealtimeData,
} = require("./realtime");
const path = require("path");
const minimist = require("minimist");

const app = express();
const port = 3300; // Sesuaikan dengan log

const args = minimist(process.argv.slice(2));
const testTableName = args.t;

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/beacons", async (req, res) => {
  const { floorplanId } = req.query;
  if (!floorplanId) {
    return res
      .status(400)
      .json({ message: "floorplanId query parameter required" });
  }
  try {
    const { gateways, scale } = await initializeRealtimeData(floorplanId);
    setupRealtimeStream(floorplanId); // Inisialisasi stream untuk floorplanId
    const beaconPositions = generateBeaconPositions(
      floorplanId,
      gateways,
      scale
    );
    res.json(beaconPositions);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch beacon positions",
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

async function startServer() {
  try {
    await initializeDatabase(testTableName);
    startMqttClient(() => {}); // Callback kosong
    app.listen(port, () => {
      console.log(`HTTP server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    throw error;
  }
}

startServer();
