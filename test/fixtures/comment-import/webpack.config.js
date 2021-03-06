'use strict';

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const loader = require.resolve('../../..');
const cssLoader = require.resolve('css-loader');

module.exports = {
  mode: 'development',
  context: path.join(__dirname),
  entry: {
    index: './index.scss',
  },
  output: {
    path: path.join(__dirname, '../../runtime/comment-import'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.(scss|sass)$/,
        use: [MiniCssExtractPlugin.loader, cssLoader, loader],
      },
      {
        test: /\.png$/,
        loader: 'file-loader?name=[path][name].[ext]',
      },
    ],
  },
  plugins: [new MiniCssExtractPlugin({ filename: '[name].css' })],
};
