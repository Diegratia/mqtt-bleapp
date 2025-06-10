// // var mqtt = require("mqtt");
// // var sma = require("sma");
// const { KalmanFilter } = require("kalman-filter");
// // var Topic = "test/topic";
// // var Broker_URL = "mqtt://localhost:1884";

// // var options = {
// //   clientId: "KlienGweh",
// //   username: "test1",
// //   password: "test1",
// // };

// // let rssiBufferPerGateway = {};
// // let readyToSendData = [];
// // const windowSize = 10;

// // function startMqttClient(messageCallback) {
// //   var client = mqtt.connect(Broker_URL, options);
// //   client.on("connect", mqtt_connect);
// //   client.on("error", mqtt_error);
// //   client.on("message", mqtt_messageReceived);

// //   function mqtt_connect() {
// //     client.subscribe(Topic, mqtt_subscribe);
// //   }

// //   function mqtt_subscribe(err, granted) {
// //     console.log("Subscribed to " + Topic);
// //     if (err) {
// //       console.log(err);
// //     }
// //   }

// //   function mqtt_error(err) {
// //     console.log("MQTT error:", err);
// //   }

// //   function mqtt_messageReceived(topic, message, packet) {
// //     try {
// //       var message_str = message.toString();
// //       var data = JSON.parse(message_str);
// //       const gatewayId = data.gmac;
// //       if (data.obj) {
// //         data.obj.forEach((beacon) => {
// //           const beaconId = beacon.dmac;

// //           if (beacon.rssi !== undefined && !isNaN(beacon.rssi)) {
// //             console.log(`Gateway: ${gatewayId}, Beacon: ${beaconId}`);
// //             console.time("Processing Time");
// //             if (!rssiBufferPerGateway[gatewayId]) {
// //               rssiBufferPerGateway[gatewayId] = {};
// //             }

// //             if (!rssiBufferPerGateway[gatewayId][beaconId]) {
// //               rssiBufferPerGateway[gatewayId][beaconId] = [];
// //             }

// //             rssiBufferPerGateway[gatewayId][beaconId].push(beacon.rssi);

// //             // buffer penuh buang data lama
// //             if (rssiBufferPerGateway[gatewayId][beaconId].length > windowSize) {
// //               rssiBufferPerGateway[gatewayId][beaconId].shift();
// //             }

// //             if (
// //               rssiBufferPerGateway[gatewayId][beaconId].length === windowSize
// //             ) {
// //               console.log(
// //                 `\n${windowSize} RSSI ditampung untuk Gateway: ${gatewayId}, DMAC: ${beaconId}`
// //               );
// //               console.log(rssiBufferPerGateway[gatewayId][beaconId]);

// //               // kalman filter
// //               const kFilter = new KalmanFilter();
// //               const filteredRSSI = kFilter.filterAll(
// //                 rssiBufferPerGateway[gatewayId][beaconId]
// //               );

// //               console.log("Hasil filter Kalman:");
// //               console.log(filteredRSSI.map((f) => f[0]));

// //               // ambil nilai kalman saja
// //               const kalmanValues = filteredRSSI.map((f) => f[0]);

// //               // hitung moving average
// //               const avgFilteredRSSI = sma(kalmanValues);

// //               console.log(
// //                 `Rata-rata Kalman untuk Gateway: ${gatewayId}, DMAC: ${beaconId}: ${avgFilteredRSSI}`
// //               );

// //               // buat beacon baru yang sudah difilter
// //               let filteredBeacon = {
// //                 ...beacon,
// //                 rssi: parseFloat(avgFilteredRSSI),
// //                 gmac: gatewayId,
// //               };

// //               readyToSendData.push(filteredBeacon);
// //             }

// //             console.timeEnd("Processing Time");
// //           } else {
// //             console.log(`Invalid RSSI value: ${beacon.rssi}`);
// //           }
// //         });
// //       }
// //     } catch (error) {
// //       console.error("Error parsing message:", error.message);
// //     }
// //   }

// //   setInterval(() => {
// //     if (readyToSendData.length > 0) {
// //       const payload = {
// //         obj: readyToSendData.splice(0, readyToSendData.length),
// //       };

// //       messageCallback(payload);
// //       console.log("sudah 2 detik");
// //     }
// //   }, 2000);

// //   return client;
// // }

// // module.exports = { startMqttClient };

// var mqtt = require("mqtt");
// const { Kalman } = require("kalmanjs");
// const { KalmanFilter } = require("kalman-filter");
// var Topic = "test/topic";
// var Broker_URL = "mqtt://localhost:1884";

// var options = {
//   clientId: "KlienGweh",
//   username: "test1",
//   password: "test1",
// };

// function startMqttClient(messageCallback) {
//   var client = mqtt.connect(Broker_URL, options);
//   client.on("connect", mqtt_connect);
//   client.on("error", mqtt_error);
//   client.on("message", mqtt_messageReceived);

//   function mqtt_connect() {
//     client.subscribe(Topic, mqtt_subscribe);
//   }

//   function mqtt_subscribe(err, granted) {
//     console.log("Subscribed to " + Topic);
//     if (err) {
//       console.log(err);
//     }
//   }

//   function mqtt_error(err) {
//     console.log("MQTT error:", err);
//   }

//   function mqtt_messageReceived(topic, message, packet) {
//     try {
//       var message_str = message.toString();
//       var data = JSON.parse(message_str);
//       console.log(data);

//       if (data.obj) {
//         data.obj.forEach((beacon) => {
//           if (beacon.dmac == "BC572913EA8B" || beacon.dmac == "DD33041347D5" || beacon.dmac == "BC572913EA8A") {
//             const kf = new KalmanFilter();
//             const kalmanfilterrssi = kf.filter(beacon.rssi);

//             console.log(
//               `Raw RSSI: ${beacon.rssi}, Filtered RSSI: ${kalmanfilterrssi}`
//             );
//             beacon.filteredRssi = kalmanfilterrssi;
//           }
//         });
//       }

//       messageCallback(data);
//     } catch (error) {
//       console.error("Error parsing message:", error.message);
//     }
//   }
//   return client;
// }

// var collectionRssiGate = {};

// module.exports = { startMqttClient };
// var measure = -59;
// var mqtt = require("mqtt");
// const { KalmanFilter } = require("kalman-filter");
// const { TimeScale } = require("chart.js");
// var Topic = "test/topic";
// var Broker_URL = "mqtt://localhost:1884";
// var checkkalmanlimit = 5;
// var scale = 3.8;

// var options = {
//   clientId: "KlienGweh",
//   username: "test1",
//   password: "test1",
// };

// function startMqttClient(messageCallback) {
//   var client = mqtt.connect(Broker_URL, options);
//   client.on("connect", mqtt_connect);
//   client.on("error", mqtt_error);
//   client.on("message", mqtt_messageReceived);

//   function mqtt_connect() {
//     client.subscribe(Topic, mqtt_subscribe);
//   }

//   function mqtt_subscribe(err, granted) {
//     console.log("Subscribed to " + Topic);
//     if (err) {
//       console.log(err);
//     }
//   }

//   function mqtt_error(err) {
//     console.log("MQTT error:", err);
//   }
//   function mqtt_messageReceived(topic, message, packet) {
//     const kf = new KalmanFilter({
//       observation: 1,
//     });

//     var message_str = message.toString();
//     var data = JSON.parse(message_str);
//     const gatewayId = data.gmac;
//     console.log(data);
//     console.log(gatewayId);

// if(gatewayId == "282C02227FDD"){ // skip gateway id 2
//   return;
// }
// if(gatewayId == "282C02227F53"){ // skip gateway id 1
//   return;
// }

// try {
// const kFilter = new KalmanFilter();
// const res = kFilter.filterAll(message);

//     // console.log(gatewayId);

//     if (data.obj) {
//       data.obj.forEach((beacon) => {
//         if (beacon.type != 4) {
//           return;
//         }
//         if (
//           1 == 1
//           // beacon.dmac == "BC572913EA8B" ||
//           // beacon.dmac == "BC572913EA73" ||
//           // beacon.dmac == "BC572905D5B9" ||
//           // beacon.dmac == "BC572905DB80"
//         ) {
//           beacon.gmac = gatewayId;
//           var gmac = gatewayId;
//           // var dmac = beacon.dmac;
//           // if (collectionRssiGate[gmac] == null) {
//           //   collectionRssiGate[gmac] = {};
//           // }

//           // if (collectionRssiGate[gmac][dmac] == null) {
//           //   collectionRssiGate[gmac][dmac] = JSON.parse(JSON.stringify([]));
//           //   collectionRssiGate[gmac][dmac].push(beacon.rssi);
//           //   // console.log("collect to kalman ",dmac,collectionRssiGate[gmac][dmac].length )
//           //   return;
//           // } else if (collectionRssiGate[gmac][dmac].length < checkkalmanlimit) {
//           //   collectionRssiGate[gmac][dmac].push(beacon.rssi);
//           //   // console.log("collect to kalman ",dmac,collectionRssiGate[gmac][dmac].length )
//           //   return;
//           // }
//           // collectionRssiGate[gmac][dmac].push(beacon.rssi);
//           // var maxrssi = JSON.parse(
//           //   JSON.stringify(collectionRssiGate[gmac][dmac])
//           // );

//           // collectionRssiGate[gmac][dmac] = JSON.parse(JSON.stringify([]));
//           // // console.log(maxrssi)
//           // var observationdata = maxrssi.map((v) => [v]);
//           // // console.log(observationdata)
//           // const kalmanfilterrssi = kf
//           //   .filterAll(observationdata)
//           //   .map((v) => v[0]);
//           // var findMostFrequentdata = findMostFrequent(kalmanfilterrssi);
//           // var trommedMean = trimmedMean(kalmanfilterrssi, 0, 1);
//           // var stablerssi = kalmanfilterrssi[kalmanfilterrssi.length - 1];
//           // // beacon.rssi_kf = kalmanfilterrssi
//           // // beacon.gmac =
//           // var refpower = beacon.refpower || measure;
//           // // outdoor
//           // var cal = calculateDistance(stablerssi, refpower, 2, 5);
//           // var calmod = calculateDistance(findMostFrequentdata, refpower, 2, 5);
//           // var calmean = calculateDistance(trommedMean, refpower, 2, 5);
//           beacon.meter = cal.totalDistance;
//           beacon.measure = measure;
//           var _scale = scale;
//           // if(beacon.meter > 15){
//           //   _scale = _scale ;
//           // }else if(beacon.meter > 15 && beacon.meter <= 20 ){
//           //   _scale = _scale /3.5;
//           // }else if(beacon.meter > 20 && beacon.meter < 25 ){
//           //   _scale = _scale /3;
//           // }
//           // console.log(cal);
//           var realDist = beacon.meter * _scale;
//           // console.log(gmac,dmac, realDist);
//           beacon.calcDist = realDist;
//           //
//           // var gmac  = beacon.gmac;
//           let filteredBeacon = {
//             ...beacon,
//           };
//           console.log(
//             dmac,
//             `modus ${findMostFrequentdata}`,
//             `mean ${trommedMean}`,
//             `stable ${stablerssi}`
//           );
//           console.log(
//             dmac,
//             `modus ${calmod.totalDistance}`,
//             `mean ${calmean.totalDistance}`,
//             `stable ${cal.totalDistance}`
//           );
//           // console.log("filteredBeacon")
//           // console.log(filteredBeacon)

//           messageCallback(filteredBeacon);
//         }
//       });
//     }
//     // } catch (error) {
//     // console.error("Error parsing message:", error.message);
//     // }
//   }
//   return client;
// }
// function findMostFrequent(arr) {
//   const freq = {};
//   arr.forEach((val) => (freq[val] = (freq[val] || 0) + 1));
//   return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
// }
// function trimmedMean(arr, trim = 0.1) {
//   const sorted = arr.slice().sort((a, b) => a - b);
//   const n = Math.floor(arr.length * trim);
//   const trimmed = sorted.slice(n, sorted.length - n);
//   return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
// }

// function calculateDistance(
//   rssi,
//   measuredPower,
//   pathLossExponent,
//   transmitterHeight
// ) {
//   // Hitung jarak total (3D distance)
//   const exponent = (measuredPower - rssi) / (10 * pathLossExponent);
//   const distanceTotal = Math.pow(10, exponent);
//   // Hitung jarak horizontal (2D) menggunakan Pythagoras
//   const horizontalDistance = Math.sqrt(
//     Math.pow(distanceTotal, 2) - Math.pow(transmitterHeight, 2)
//   );

//   return {
//     totalDistance: distanceTotal,
//     horizontalDistance: horizontalDistance,
//   };
// }

// module.exports = { startMqttClient };//
//

module.exports = { startMqttClient };
var measure = -59;
var mqtt = require("mqtt");
const { KalmanFilter } = require("kalman-filter");
// var Topic = "test/demo";
var Topic = "test/topic";
var Broker_URL = "mqtt://localhost:1884";
var scale = 3.8;

var options = {
  // clientId: "KlienDemo",
  // username: "ZSnHSIqUpL",
  // password: "z8YlpKB0UX",
  clientId: "KlienGweh",
  username: "test1",
  password: "test1",
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
    // console.log("Subscribed to " + Topic);
    if (err) {
      console.log(err);
    }
  }

  function mqtt_error(err) {
    console.log("MQTT error:", err);
  }

  function mqtt_messageReceived(topic, message, packet) {
    try {
      // const kFilter = new KalmanFilter();
      // const res = kFilter.filterAll(message);
      var message_str = message.toString();
      // console.log(message_str);
      var data = JSON.parse(message_str);

      const gatewayId = data.gmac;
      // console.log(gatewayId);

      if (data.obj) {
        data.obj.forEach((beacon) => {
          if (beacon.type == 32) {
            return;
          }

          {
            // beacon.gmac =
            // console.log(beacon);
            var refpower = beacon.refpower || measure;
            // outdoor
            var cal = calculateDistance(beacon.rssi, refpower, 2, 10);
            beacon.meter = cal.totalDistance;
            beacon.measure = measure;
            beacon.gmac = gatewayId;
            var realDist = beacon.meter * scale;
            beacon.calcDist = realDist;

            let filteredBeacon = {
              ...beacon,
            };

            // console.log(filteredBeacon);

            messageCallback(filteredBeacon);
          }
        });
      }
    } catch (error) {
      console.error("Error parsing message:", error.message);
    }
  }
  return client;
}

console.log(calculateDistance(-100, -59, 2, 10), "-59");
console.log(calculateDistance(-100, -51, 2, 10), "-51");
console.log(calculateDistance(-100, -75, 2, 10), "-75");
console.log(calculateDistance(-100, -85, 2, 10), "-85");

/*************  ✨ Windsurf Command ⭐  *************/
/**
 * Calculates the total and horizontal distance based on RSSI, measured power,
 * path loss exponent, and transmitter height.
 *
 * @param {number} rssi - The received signal strength indicator.
 * @param {number} measuredPower - The expected RSSI at 1 meter distance.
 * @param {number} pathLossExponent - The path loss exponent, environment-specific.
 * @param {number} transmitterHeight - The height of the transmitter.
 * @returns {Object} An object containing the total distance (3D) and horizontal distance (2D).
 */

/*******  d073d9f8-4d43-4389-98ac-deaef8a781a0  *******/

function calculateDistance(
  rssi,
  measuredPower,
  pathLossExponent,
  transmitterHeight
) {
  // Hitung jarak total (3D distance)
  const exponent = (measuredPower - rssi) / (10 * pathLossExponent);
  const distanceTotal = Math.pow(10, exponent);
  // Hitung jarak horizontal (2D) menggunakan Pythagoras
  const horizontalDistance = Math.sqrt(
    Math.pow(distanceTotal, 2) - Math.pow(transmitterHeight, 2)
  );

  return {
    totalDistance: distanceTotal,
    horizontalDistance: horizontalDistance,
  };
}

module.exports = { startMqttClient };
