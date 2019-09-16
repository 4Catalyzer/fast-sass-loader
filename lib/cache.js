const { debuglog } = require('util');

const debug = debuglog('fast-sass-loader:cache');

// compile cache
// cache = {
//   <entry>: {
//      mtime: <Number>,            // 修改时间
//      writeTimes: <Number>,       // 编译次数
//      readTimes: <Number>,        // 读取次数 (自最后一次编译)
//      lastCompile: <Number>,      // 最后一次编译
//      result: <String>,           // 编译结果
//      dependencies: {             // 依赖文件状态
//          <file>: <Number>,       // 依赖文件以及修改时间
//          ...
//      }
//   },
//   ...
// }
const CACHE_STORE = new Map();

/**
 * Cache
 *
 * Usage:
 *
 * let cache = new Cache(entry)
 *
 * if (cache.isValid()) {
 *   return cache.read()
 * } else {
 *   // compile sass ....
 *   cache.write(dependencies, result.css.toString())
 * }
 */
class Cache {
  constructor(entry, fs) {
    this.fs = fs;
    this.entry = entry;
  }

  fstat(file) {
    try {
      return this.fs.statSync(file);
    } catch (err) {
      return false;
    }
  }

  isValid() {
    const cache = CACHE_STORE.get(this.entry);

    if (!cache) {
      debug('not in cache');
      return false;
    }
    const estat = this.fstat(this.entry);

    // 文件不存在, 或时间不正确
    if (!estat || estat.mtime.getTime() !== cache.mtime) {
      debug('mtime has changed');
      return false;
    }

    for (const depFile of Object.keys(cache.dependencies)) {
      const mtime = cache.dependencies[depFile];
      const dstat = this.fstat(depFile);

      if (!dstat || dstat.mtime.getTime() !== mtime) {
        debug('dependency mtime has changed');
        return false;
      }
    }

    return true;
  }

  read() {
    const cache = CACHE_STORE.get(this.entry);

    if (cache) {
      cache.readTimes++;
      return cache.result;
    }
    return false;
  }

  getDependencies() {
    const cache = CACHE_STORE.get(this.entry);
    return cache ? Object.keys(cache.dependencies) : [];
  }

  markInvalid() {
    CACHE_STORE.delete(this.entry);
  }

  write(dependencies, result) {
    const estat = this.fstat(this.entry);
    if (!estat) {
      debug("write: file doesn't exist");
      return;
    }

    let cache = CACHE_STORE.get(this.entry);

    if (!cache) {
      cache = {
        mtime: 0,
        writeTimes: 0,
        readTimes: 0,
        lastCompile: Date.now(),
        result: null,
        dependencies: {},
      };
      CACHE_STORE.set(this.entry, cache);
    }

    cache.mtime = estat.mtime.getTime();
    cache.writeTimes++;
    cache.readTimes = 0;
    cache.result = result;
    cache.dependencies = {};

    for (let i = 0; i < dependencies.length; i++) {
      const depFile = dependencies[i];
      const dstat = this.fstat(depFile);

      cache.dependencies[depFile] = dstat ? dstat.mtime.getTime() : 0;
    }
  }
}

module.exports = Cache;
