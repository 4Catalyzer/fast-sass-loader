const assert = require('assert');
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const prettier = require('prettier');
const rmdir = require('rimraf');

function assertAreEqual(input, expect) {
  assert.equal(
    prettier.format(input, { parser: 'css' }),
    prettier.format(expect, { parser: 'css' }),
  );
}

function handleError(err, stats, done) {
  if (err) {
    console.error(err.stack || err);
    if (err.details) {
      console.error(err.details);
    }
    done(err);
    return false;
  }

  console.log(
    stats.toString({
      colors: true, // Shows colors in the console
    }),
  );

  const info = stats.toJson();
  if (stats.hasErrors()) {
    done(info.errors);
    return false;
  }

  return true;
}

function runSimpleTest(done, fixtureName) {
  const config = require(path.resolve(
    __dirname,
    'fixtures',
    fixtureName,
    'webpack.config.js',
  ));
  const compiler = webpack(config);

  compiler.run((err, stats) => {
    if (!handleError(err, stats, done)) {
      return;
    }

    try {
      assert.equal(stats.errors, undefined);

      const css = fs.readFileSync(
        path.join(__dirname, `runtime/${fixtureName}/index.css`),
        'utf8',
      );
      const expect = fs.readFileSync(
        path.join(__dirname, `fixtures/${fixtureName}/expect.css`),
        'utf8',
      );

      assertAreEqual(css, expect);

      done();
    } catch (e) {
      done(e);
    }
  });
}

describe('test sass-loader', () => {
  const runtimeDir = path.join(__dirname, 'runtime');

  // eslint-disable-next-line no-undef
  before(done => {
    rmdir(runtimeDir, done);
  });

  afterEach(done => {
    rmdir(runtimeDir, done);
  });

  it('should load normal sass file', function(done) {
    const config = require('./fixtures/normal/webpack.config.js');
    const compiler = webpack(config);

    compiler.run((err, stats) => {
      if (!handleError(err, stats, done)) {
        return;
      }

      try {
        assert.equal(stats.errors, undefined);

        const css = fs.readFileSync(
          path.join(__dirname, 'runtime/normal/index.css'),
          'utf8',
        );
        const expect = fs.readFileSync(
          path.join(__dirname, 'fixtures/normal/expect.css'),
          'utf8',
        );

        assertAreEqual(css, expect);

        const css2 = fs.readFileSync(
          path.join(__dirname, 'runtime/normal/index2.css'),
          'utf8',
        );
        const expect2 = fs.readFileSync(
          path.join(__dirname, 'fixtures/normal/expect2.css'),
          'utf8',
        );

        assertAreEqual(css2, expect2);
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('should load sass file with data option', function(done) {
    const config = require('./fixtures/withData/webpack.config.js');
    const compiler = webpack(config);

    compiler.run((err, stats) => {
      if (!handleError(err, stats, done)) {
        return;
      }

      try {
        assert.equal(stats.errors, undefined);

        const css = fs.readFileSync(
          path.join(__dirname, 'runtime/withData/index.css'),
          'utf8',
        );
        const expect = fs.readFileSync(
          path.join(__dirname, 'fixtures/withData/expect.css'),
          'utf8',
        );

        assertAreEqual(css, expect);
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('should compile without options', done => {
    runSimpleTest(done, 'simple');
  });

  it('should auto remove BOM header', done => {
    runSimpleTest(done, 'bom-issue');
  });

  it('should resolve files with double extensions', done => {
    runSimpleTest(done, 'double-extensions');
  });

  it('should be able to import non sass files with a passed transformer', done => {
    runSimpleTest(done, 'withTransformer');
  });

  it('should be able to skip import in comment', done => {
    runSimpleTest(done, 'comment-import');
  });
});
