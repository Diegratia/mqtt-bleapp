const mqtt = require("mqtt");

const Broker_URL = "mqtt://localhost:1884";
const Topic = "test/topic";
const options = {
  clientId: "Simulator",
  username: "test1",
  password: "test1",
};

const gateways = ["282C02227F53", "282C02227FDD", "282C02227F1A"];
const dmacs = ["BC572905DB80", "BC572905DB81"];
const refpower = -59;
const type = 4;
const rssiRange = { min: -75, max: -60 };

function generateBeaconData() {
  const gmac = gateways[Math.floor(Math.random() * gateways.length)];
  const dmac = dmacs[Math.floor(Math.random() * dmacs.length)];
  const rssi = Math.floor(
    Math.random() * (rssiRange.max - rssiRange.min + 1) + rssiRange.min
  );
  const time = new Date()
    .toISOString()
    .replace("T", " ")
    .replace("Z", ",000");

  return {
    gmac,
    obj: [
      {
        type,
        dmac,
        rssi,
        refpower,
        time,
      },
    ],
  };
}

function startSimulation() {
  const client = mqtt.connect(Broker_URL, options);

  client.on("connect", () => {
    console.log("Simulator terhubung ke broker MQTT");
    setInterval(() => {
      const data = generateBeaconData();
      const message = JSON.stringify(data);
      client.publish(Topic, message, { qos: 0 }, (err) => {
        if (err) {
          console.error("Gagal publish:", err.message);
        } else {
          console.log("Terkirim:", message);
        }
      });
    }, 5000);
  });

  client.on("error", (err) => {
    console.error("Error MQTT:", err.message);
  });
}

startSimulation();