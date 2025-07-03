const express = require("express");
const cors = require("cors");
const { initializeDatabase } = require("./database");
// const { startMqttClient } = require("./mqtt");
const {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeAllFloorplans,
  initializeRealtimeData,
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
