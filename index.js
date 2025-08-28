const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./database");
const { deactivateAlarm } = require("./beaconStorage");
// const { startMqttClient } = require("./mqtt");
const {
  setupRealtimeStream,
  initializeAllFloorplans,
  initializeCardCache,
  initializeBlacklistArea,
  lastBeaconState,
} = require("./realtime");
const path = require("path");
const minimist = require("minimist");

const app = express();
const port = 3300;

const args = minimist(process.argv.slice(2));
const testTableName = args.t;

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

app.post("/deactivate-alarm", async (req, res) => {
  try {
    const { dmac } = req.body;
    if (!dmac) {
      return res.status(400).json({ error: "DMAC is required" });
    }

    const deactivated = await deactivateAlarm(dmac);
    if (deactivated) {
      res.json({ message: `Alarm for beacon ${dmac} deactivated` });
    } else {
      res
        .status(404)
        .json({ error: `No active alarm found for beacon ${dmac}` });
    }
  } catch (error) {
    console.error(`Error deactivating alarm: ${error.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/dummy-beacon", (req, res) => {
  const dummyPayload = {
    beaconId: "BC572913EA73",
    pair: "4CA38F691898_4CA38F691FBC",
    first: "4CA38F691898",
    second: "4CA38F691FBC",
    firstDist: 0.7308942609914024,
    secondDist: 0.8749761761801619,
    point: {
      x: 985,
      y: 248,
    },
    inRestrictedArea: true,
    firstReaderCoord: {
      id: "4CA38F691898",
      x: 987.87,
      y: 249.89,
    },
    secondReaderCoord: {
      id: "4CA38F691FBC",
      x: 669.64,
      y: 30.54,
    },
    time: "2025-07-09T11:11:36.910Z",
    floorplanId: "22CCC200-84D2-4302-8B2C-48B7F3791F12",
    floorplanName: "Floor 2",
    maskedAreaName: "R Admin Mask",
    is_active: true,
  };

  res.json(dummyPayload);
});

async function startServer() {
  try {
    await initializeDatabase(testTableName);
    await initializeAllFloorplans();
    await initializeCardCache();
    await initializeBlacklistArea();
    setupRealtimeStream();
    app.listen(port, () => {
      console.log(`running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    throw error;
  }
}

startServer();
