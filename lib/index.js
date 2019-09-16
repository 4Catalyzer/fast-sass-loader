/* eslint-disable global-require */
/* eslint-disable no-await-in-loop */
const path = require('path');
const preview = require('cli-source-preview');
const { promisify, debuglog } = require('util');
const loaderUtils = require('loader-utils');
const Cache = require('./cache');
const utils = require('./utils');
const replaceAsync = require('./replace');

const BOM_HEADER = '\uFEFF';
const EXT_PRECEDENCE = ['.scss', '.sass', '.css'];
const MATCH_URL_ALL = /url\(\s*(['"]?)([^ '"()]+)(\1)\s*\)/g;
const MATCH_IMPORTS = /@import\s+(['"])([^,;'"]+)(\1)(\s*,\s*(['"])([^,;'"]+)(\1))*\s*(;|$)/g;
const MATCH_FILES = /(['"])([^,;'"]+)(\1)/g;

const debug = debuglog('fast-sass-loader');

let renderSass;
try {
  // eslint-disable-next-line import/no-unresolved
  const impl = require('node-sass');
  renderSass = promisify(impl.render.bind(impl));
} catch (error) {
  try {
    // eslint-disable-next-line import/no-unresolved
    const impl = require('sass');
    // We don't care about sync since we don't allow custom importers
    // https://github.com/sass/dart-sass/issues/744#issuecomment-507429974
    renderSass = (...args) => Promise.resolve(impl.renderSync(...args));
  } catch (_ignore) {
    throw new Error(
      `Could not resolve \`node-sass\` or \`sass\` please have your prefered implementation installed. \n\n${error.message}`,
    );
  }
}

class FastSassLoaderError extends Error {
  constructor(source, err) {
    super();

    const { message } = err;

    this.name = 'FastSassLoaderError';
    this.message = `${message}\n\n${preview(source, err, { offset: 5 })}\n`;

    Error.captureStackTrace(this, this.constructor);
  }
}

function getImportsToResolve(original, includePaths, transformers) {
  const extname = path.extname(original);
  let basename = path.basename(original, extname);
  const dirname = path.dirname(original);

  const imports = [];
  let names = [basename];
  let exts = [extname];
  const extensionPrecedence = [
    ...EXT_PRECEDENCE,
    ...Object.keys(transformers),
  ];

  if (!extname) {
    exts = extensionPrecedence;
  }
  if (extname && extensionPrecedence.indexOf(extname) === -1) {
    basename = path.basename(original);
    names = [basename];
    exts = extensionPrecedence;
  }
  if (basename[0] !== '_') {
    names.push(`_${basename}`);
  }

  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < exts.length; j++) {
      // search relative to original file
      imports.push(path.join(dirname, names[i] + exts[j]));

      // search in includePaths
      for (const includePath of includePaths) {
        imports.push(path.join(includePath, dirname, names[i] + exts[j]));
      }
    }
  }

  return imports;
}

function createTransformersMap(transformers) {
  if (!transformers) return {};

  // return map of extension strings to transformer functions
  return transformers.reduce((acc, transformer) => {
    transformer.extensions.forEach(ext => {
      acc[ext] = transformer.transform;
    });
    return acc;
  }, {});
}

function getLoaderConfig(ctx) {
  const options = loaderUtils.getOptions(ctx) || {};
  const includePaths = options.includePaths || [];
  const basedir =
    ctx.rootContext || options.context || ctx.options.context || process.cwd();
  const transformers = createTransformersMap(options.transformers);

  // convert relative to absolute
  for (let i = 0; i < includePaths.length; i++) {
    if (!path.isAbsolute(includePaths[i])) {
      includePaths[i] = path.join(basedir, includePaths[i]);
    }
  }

  return {
    basedir,
    includePaths,
    transformers,
    baseEntryDir: path.dirname(ctx.resourcePath),
    root: options.root,
    data: options.data,
  };
}

async function mergeSources(
  opts,
  entry,
  resolveModule,
  dependencies,
  fs,
  level,
) {
  level = level || 0;
  dependencies = dependencies || [];

  const { includePaths, transformers } = opts;
  let content = false;

  function readFile(file) {
    return new Promise((resolve, reject) =>
      fs.readFile(file, (err, result) => {
        if (err) reject(err);
        else resolve(result.toString('utf8'));
      }),
    );
  }

  function existsSync(file) {
    try {
      return !!fs.statSync(file);
    } catch (err) {
      return false;
    }
  }

  if (typeof entry === 'object') {
    content = entry.content;
    entry = entry.file;
  } else {
    content = await readFile(entry);

    // fix BOM issue (only on windows)
    if (content.startsWith(BOM_HEADER)) {
      content = content.substring(BOM_HEADER.length);
    }
  }

  const ext = path.extname(entry);

  if (transformers[ext]) {
    content = transformers[ext](content);
  }

  if (opts.data) {
    content = `${opts.data}\n${content}`;
  }

  const entryDir = path.dirname(entry);

  // replace url(...)
  content = content.replace(MATCH_URL_ALL, (total, left, file, right) => {
    if (loaderUtils.isUrlRequest(file)) {
      // handle url(<loader>!<file>)
      const pos = file.lastIndexOf('!');
      if (pos >= 0) {
        left += file.substring(0, pos + 1);
        file = file.substring(pos + 1);
      }

      // test again
      if (loaderUtils.isUrlRequest(file)) {
        const absoluteFile = path.normalize(path.resolve(entryDir, file));
        let relativeFile = path
          .relative(opts.baseEntryDir, absoluteFile)
          .replace(/\\/g, '/'); // fix for windows path

        if (relativeFile[0] !== '.') {
          relativeFile = `./${relativeFile}`;
        }

        return `url(${left}${relativeFile}${right})`;
      }
      return total;
    }
    return total;
  });

  // find comments should after content.replace(...), otherwise the comments offset will be incorrect
  const commentRanges = utils.findComments(content);

  // replace @import "..."
  async function importReplacer(total) {
    // if current import is in comments, then skip it
    const range = this;
    const finded = commentRanges.find(
      commentRange =>
        range.start >= commentRange[0] && range.end <= commentRange[1],
    );

    if (finded) {
      return total;
    }

    const contents = [];
    let matched;

    // must reset lastIndex
    MATCH_FILES.lastIndex = 0;

    // eslint-disable-next-line
    while ((matched = MATCH_FILES.exec(total))) {
      // eslint-disable-line
      const originalImport = matched[2].trim();
      if (!originalImport) {
        const err = new Error(
          `import file cannot be empty: "${total}" @${entry}`,
        );

        err.file = entry;

        throw err;
      }

      const imports = getImportsToResolve(
        originalImport,
        includePaths,
        transformers,
      );
      let resolvedImport;

      for (let i = 0; i < imports.length; i++) {
        // if imports[i] is absolute path, then use it directly
        if (path.isAbsolute(imports[i]) && existsSync(imports[i])) {
          resolvedImport = imports[i];
        } else {
          try {
            const reqFile = loaderUtils.urlToRequest(imports[i], opts.root);

            resolvedImport = await resolveModule(entryDir, reqFile);
            break;
          } catch (err) {
            // skip
          }
        }
      }

      if (!resolvedImport) {
        const err = new Error(
          `import file cannot be resolved: "${total}" @${entry}`,
        );

        err.file = entry;

        throw err;
      }

      resolvedImport = path.normalize(resolvedImport);

      if (dependencies.indexOf(resolvedImport) < 0) {
        dependencies.push(resolvedImport);

        contents.push(
          await mergeSources(
            opts,
            resolvedImport,
            resolveModule,
            dependencies,
            fs,
            level + 1,
          ),
        );
      }
    }

    return contents.join('\n');
  }

  return replaceAsync(content, MATCH_IMPORTS, importReplacer);
}

module.exports = async function loader(content) {
  const { fs, resourcePath: entry } = this;
  const callback = this.async();

  const options = getLoaderConfig(this);
  const resolve = promisify(this.resolve.bind(this));

  const cache = new Cache(entry, fs);

  // for webpack 1
  if (this.cacheable) {
    this.cacheable();
  }

  const dependencies = [];

  if (cache.isValid()) {
    cache.getDependencies().forEach(file => {
      this.dependency(file);
    });
    return callback(null, cache.read());
  }
  debug('cache miss for %s', entry);

  let merged;
  try {
    merged = await mergeSources(
      options,
      { file: entry, content },
      resolve,
      dependencies,
      fs,
    );

    dependencies.forEach(file => {
      this.dependency(file);
    });
  } catch (err) {
    // disabled cache
    cache.markInvalid();
    // add error file as deps, so if file changed next time sass-loader will be noticed
    if (err.file) this.dependency(err.file);
    return callback(err);
  }

  let css;
  try {
    const result = await renderSass({
      indentedSyntax: entry.endsWith('.sass'),
      file: entry,
      data: merged,
    });
    css = result.css.toString();
    cache.write(dependencies, css);
  } catch (err) {
    // console.log('HERE', err);
    return callback(new FastSassLoaderError(merged, err));
  }

  return callback(null, css);
};
