// index.js
const express = require("express");
const cors = require("cors");
const { initializeDatabase, getDbPool } = require("./database");
const { startMqttClient } = require("./mqtt");
const {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeRealtimeData,
} = require("./realtime");
const sql = require("mssql");
const path = require("path");
const minimist = require("minimist");

const app = express();
const port = 3300;

const args = minimist(process.argv.slice(2));
const testTableName = args.t;

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let currentFloorplanId = null;

app.post("/api/set-floorplan", async (req, res) => {
  const { floorplanId } = req.body;
  if (!floorplanId) {
    return res.status(400).json({ message: "floorplanId required" });
  }
  try {
    await initializeRealtimeData(floorplanId);
    currentFloorplanId = floorplanId;
    setupRealtimeStream(floorplanId);
    res.json({ message: "Floorplan updated" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update floorplan", error: error.message });
  }
});

app.get("/api/beacons", async (req, res) => {
  if (!currentFloorplanId) {
    return res.status(400).json({ message: "No floorplan selected" });
  }
  try {
    const { gateways, scale } = await initializeRealtimeData(
      currentFloorplanId
    );
    const beaconPositions = generateBeaconPositions(
      currentFloorplanId,
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
    currentFloorplanId = "29DFCE6A-3D56-48CD-8D30-24002C3F2064"; // Ganti dengan UUID valid
    await initializeRealtimeData(currentFloorplanId);
    setupRealtimeStream(currentFloorplanId);
    startMqttClient(() => {}); // Callback kosong karena tidak menyimpan
    app.listen(port, () => {
      console.log(`HTTP server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    throw error;
  }
}

startServer();
