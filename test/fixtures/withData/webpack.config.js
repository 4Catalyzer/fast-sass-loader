'use strict';

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const loader = require.resolve('../../..');
const cssLoader = require.resolve('css-loader');

module.exports = {
  mode: 'development',
  context: path.join(__dirname),
  entry: {
    index: './actual/index.scss',
  },
  output: {
    path: path.join(__dirname, '../../runtime/withData'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.(scss|sass)$/,
        use: [
          MiniCssExtractPlugin.loader,
          cssLoader,
          {
            loader: loader,
            options: {
              includePaths: [path.join(__dirname, 'extra'), 'sass_modules'],
              data: '@import "_variables.scss";',
            },
          },
        ],
      },
    ],
  },
  plugins: [new MiniCssExtractPlugin({ filename: '[name].css' })],
};
