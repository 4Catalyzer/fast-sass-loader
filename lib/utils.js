const utils = {
  findComments(text) {
    const ranges = [];
    const ruleMap = {
      '//': '\n',
      '/*': '*/',
    };
    const startRule = /\/\/|\/\*/g;
    let matches;

    // eslint-disable-next-line
    while ((matches = startRule.exec(text))) {
      const endChars = ruleMap[matches[0]];
      const start = startRule.lastIndex - matches[0].length;
      let end = text.indexOf(endChars, startRule.lastIndex);

      if (end < 0) {
        end = Infinity;
      }

      ranges.push([start, end]);

      startRule.lastIndex = end;
    }

    return ranges;
  },
};

module.exports = utils;
