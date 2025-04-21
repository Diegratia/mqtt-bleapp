var mqtt = require("mqtt");
const { KalmanFilter } = require("kalman-filter");
var Topic = "test/topic";
var Broker_URL = "mqtt://localhost:1884";

var options = {
  clientId: "KlienGweh",
  username: "test1",
  password: "test1",
};

let rssiBufferPerGateway = {};
const windowSize = 10;
let readyToSendData = [];

function startMqttClient(messageCallback) {
  var client = mqtt.connect(Broker_URL, options);
  client.on("connect", mqtt_connect);
  client.on("error", mqtt_error);
  client.on("message", mqtt_messageReceived);

  function mqtt_connect() {
    client.subscribe(Topic, mqtt_subscribe);
  }

  function mqtt_subscribe(err, granted) {
    console.log("Subscribed to " + Topic);
    if (err) {
      console.log(err);
    }
  }

  function mqtt_error(err) {
    console.log("MQTT error:", err);
  }

  function mqtt_messageReceived(topic, message, packet) {
    try {
      var message_str = message.toString();
      var data = JSON.parse(message_str);

      const gatewayId = data.gmac || "unknown_gateway";

      if (data.obj) {
        data.obj.forEach((beacon) => {
          const beaconId = beacon.dmac || "unknown_beacon";

          if (beacon.rssi !== undefined && !isNaN(beacon.rssi)) {
            console.log(
              `Gateway: ${gatewayId}, Beacon: ${beaconId}, RSSI: ${beacon.rssi}`
            );

            console.time("Processing Time");

            if (!rssiBufferPerGateway[gatewayId]) {
              rssiBufferPerGateway[gatewayId] = {};
            }

            if (!rssiBufferPerGateway[gatewayId][beaconId]) {
              rssiBufferPerGateway[gatewayId][beaconId] = [];
            }

            rssiBufferPerGateway[gatewayId][beaconId].push(beacon.rssi);

            // buffer penuh buang data lama
            if (rssiBufferPerGateway[gatewayId][beaconId].length > windowSize) {
              rssiBufferPerGateway[gatewayId][beaconId].shift();
            }

            if (
              rssiBufferPerGateway[gatewayId][beaconId].length === windowSize
            ) {
              console.log(
                `\n${windowSize} RSSI ditampung untuk Gateway: ${gatewayId}, DMAC: ${beaconId}`
              );
              console.log(rssiBufferPerGateway[gatewayId][beaconId]);

              // kalman filter
              const kFilter = new KalmanFilter();
              const filteredRSSI = kFilter.filterAll(
                rssiBufferPerGateway[gatewayId][beaconId]
              );

              console.log("Hasil filter Kalman:");
              console.log(filteredRSSI.map((f) => f[0]));

              // rata rata kalman
              const avgFilteredRSSI =
                filteredRSSI.reduce((sum, val) => sum + val[0], 0) /
                filteredRSSI.length;

              console.log(
                `Rata-rata Kalman untuk Gateway: ${gatewayId}, DMAC: ${beaconId}: ${avgFilteredRSSI.toFixed(
                  2
                )}`
              );

              // buat beacon baru yang sudah difilter
              let filteredBeacon = {
                ...beacon,
                rssi: parseFloat(avgFilteredRSSI.toFixed(2)),
                gmac: gatewayId,
              };

              readyToSendData.push(filteredBeacon);
            }

            console.timeEnd("Processing Time");
          } else {
            console.log(`Invalid RSSI value: ${beacon.rssi}`);
          }
        });
      }
    } catch (error) {
      console.error("Error parsing message:", error.message);
    }
  }

  setInterval(() => {
    if (readyToSendData.length > 0) {
      const payload = {
        obj: readyToSendData.splice(0, readyToSendData.length),
      };
      messageCallback(payload);
    }
  }, 2000);

  return client;
}

module.exports = { startMqttClient };
