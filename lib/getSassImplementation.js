const { promisify } = require('util');

// switch default eventually
function getDefaultSassImplementation() {
  let sassImplPkg = 'node-sass';

  try {
    require.resolve('node-sass');
  } catch (error) {
    try {
      require.resolve('sass');
      sassImplPkg = 'sass';
    } catch (ignoreError) {
      sassImplPkg = 'node-sass';
    }
  }

  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(sassImplPkg);
}

function getSassImplementation(implementation) {
  let resolvedImplementation = implementation;

  if (!resolvedImplementation) {
    // eslint-disable-next-line no-param-reassign
    resolvedImplementation = getDefaultSassImplementation();
  }

  const { info } = resolvedImplementation;

  if (!info) {
    throw new Error('Unknown Sass implementation.');
  }

  if (info.includes('dart-sass') || info.includes('node-sass'))
    return resolvedImplementation;

  throw new Error(`Unknown Sass implementation "${info}".`);
}

module.exports = implementation => {
  const impl = getSassImplementation(implementation);
  const isDartSass = impl.info.includes('dart-sass');

  if (isDartSass) {
    // We don't care about async since we don't allow custom importers
    // https://github.com/sass/dart-sass/issues/744#issuecomment-507429974
    return [(...args) => Promise.resolve(impl.renderSync(...args)), true];
  }
  return [promisify(impl.render.bind(impl)), false];
};
