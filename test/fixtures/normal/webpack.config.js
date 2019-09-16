'use strict';

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const loader = require.resolve('../../..');
const cssLoader = require.resolve('css-loader');

console.log(loader);
module.exports = {
  mode: 'development',
  context: path.join(__dirname),
  entry: {
    index: './actual/index.scss',
    index2: './actual/index2.sass',
  },
  output: {
    path: path.join(__dirname, '../../runtime/normal'),
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
            },
          },
        ],
      },
      {
        test: /\.png$/,
        loader: 'file-loader?name=[path][name].[ext]',
      },
    ],
  },
  plugins: [new MiniCssExtractPlugin({ filename: '[name].css' })],
};
