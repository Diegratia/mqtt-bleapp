const { KalmanFilter } = require("kalman-filter");

const observations = [
  -69, -68, -67, -66, -65, -64, -63, -62, -70, -67, -66, -71,
];

const kFilter = new KalmanFilter();
const res = kFilter.filterAll(observations);

console.log(res);
