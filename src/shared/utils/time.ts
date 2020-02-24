type TimeStamp = [number, number];

function start(): TimeStamp {
  return process.hrtime();
}

function diff(start: TimeStamp): number {
  let ts = process.hrtime(start);
  let ms = ts[0] * 1000 + ts[1] / 1000000;
  return Math.round(ms);
}

export const Timer = {
  start,
  diff,
};
