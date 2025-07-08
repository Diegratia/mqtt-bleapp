const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./database");
const { deactivateAlarm } = require("./beaconStorage");
// const { startMqttClient } = require("./mqtt");
const {
  setupRealtimeStream,
  initializeAllFloorplans,
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

async function startServer() {
  try {
    await initializeDatabase(testTableName);
    await initializeAllFloorplans();
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
