var measure = -59;
var mqtt = require("mqtt");
const { KalmanFilter } = require("kalman-filter");
var Topic = "test/topic";
var Broker_URL = "mqtt://192.168.1.116:1888";
var checkkalmanlimit = 20;
var scale = 3.8;

const kalmanFilters = new Map();
const collectionRssiGate = {};

var options = {
  clientId: "KlienGweh",
  username: "bio_mqtt",
  password: "P@ssw0rd",
};

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

      const gatewayId = data.gmac;

      if (data.obj) {
        data.obj.forEach((beacon) => {
          if (beacon.type !== 4) return;
          if (
            beacon.dmac == "BC572913EA8B" ||
            beacon.dmac == "BC572913EA73" ||
            beacon.dmac == "BC572913EA8A"
          )
            beacon.gmac = gatewayId;
          var gmac = gatewayId;
          var dmac = beacon.dmac;

          if (!collectionRssiGate[gmac]) {
            collectionRssiGate[gmac] = {};
          }
          if (!collectionRssiGate[gmac][dmac]) {
            collectionRssiGate[gmac][dmac] = [];
          }

          collectionRssiGate[gmac][dmac].push(beacon.rssi);
          if (collectionRssiGate[gmac][dmac].length < checkkalmanlimit) {
            return;
          }

          const filterKey = `${dmac}_${gmac}`;
          let kf = kalmanFilters.get(filterKey);
          if (!kf) {
            kf = new KalmanFilter({ observation: 1 });
            kalmanFilters.set(filterKey, kf);
          }

          const observationData = collectionRssiGate[gmac][dmac].map((rssi) => [
            rssi,
          ]);
          const kalmanfilterrssi = kf
            .filterAll(observationData)
            .map((v) => v[0]);

          const filteredRssiLast =
            kalmanfilterrssi[kalmanfilterrssi.length - 1];
          const filteredRssiMean = mean(kalmanfilterrssi);
          const filteredRssiModus = modus(kalmanfilterrssi);
          const filteredRssiTrimmed = trimmedMean(kalmanfilterrssi);

          const filteredRssi = filteredRssiModus;

          // console.log(`DMAC ${dmac}`);
          // console.log("Kalman (last):", filteredRssiLast);
          // console.log("Kalman (mean):", filteredRssiMean);
          // console.log("Kalman (modus):", filteredRssiModus);
          // console.log("Kalman (trimmedMean):", filteredRssiTrimmed);

          var refpower = beacon.refpower || measure;
          var cal = calculateDistance(filteredRssi, refpower, 2, 5);
          beacon.meter = cal.totalDistance;
          beacon.measure = measure;
          var realDist = beacon.meter * scale;
          beacon.calcDist = realDist;

          let filteredBeacon = {
            ...beacon,
          };
          collectionRssiGate[gmac][dmac] = [];
          messageCallback(topic, filteredBeacon);
        });
      }
    } catch (error) {
      console.error("Error parsing message:", error.message);
    }
  }
  return client;
}

function calculateDistance(
  rssi,
  measuredPower,
  pathLossExponent,
  transmitterHeight
) {
  const exponent = (measuredPower - rssi) / (10 * pathLossExponent);
  const distanceTotal = Math.pow(10, exponent);
  const horizontalDistance = Math.sqrt(
    Math.pow(distanceTotal, 2) - Math.pow(transmitterHeight, 2)
  );

  return {
    totalDistance: distanceTotal,
    horizontalDistance: horizontalDistance,
  };
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function modus(arr) {
  const freq = {};
  arr.forEach((val) => (freq[val] = (freq[val] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

function trimmedMean(arr, trim = 0.1) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const n = Math.floor(arr.length * trim);
  const trimmed = sorted.slice(n, sorted.length - n);
  return trimmed.length === 0
    ? null
    : trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

module.exports = { startMqttClient };
