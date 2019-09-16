const async = require('async');

function replaceByRanges(text, ranges, replaces) {
  const points = [0];
  const map = {};
  const pieces = [];

  ranges.forEach((range, i) => {
    points.push(range[0]);
    points.push(range[1]);

    map[`${range[0]}-${range[1]}`] = replaces[i] || '';
  });

  points.push(Infinity);

  while (points.length > 1) {
    const start = points.shift();
    const stop = points[0];
    const key = `${start}-${stop}`;

    if (key in map) {
      pieces.push(map[key]);
    } else {
      pieces.push(text.substring(start, stop));
    }
  }

  return pieces.join('');
}

/**
 * replace string async
 *
 * @param  {String} text        text to replace
 * @param  {RegExp} rule        RegExp
 * @param  {Function} replacer  function that return promise
 * @return {String}
 */
function replaceAsync(text, rule, replacer) {
  let matches;
  const ranges = [];

  rule.lastIndex = 0;

  while ((matches = rule.exec(text))) {
    ranges.push([
      rule.lastIndex - matches[0].length,
      rule.lastIndex,
      matches.slice(),
    ]);
  }

  return new Promise((resolve, reject) => {
    async.mapSeries(
      ranges,
      (range, done) => {
        replacer
          .apply({ start: range[0], end: range[1] }, range[2])
          .then(ret => done(null, ret), err => done(err));
      },
      (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(replaceByRanges(text, ranges, results));
        }
      },
    );
  });
}

module.exports = replaceAsync;
