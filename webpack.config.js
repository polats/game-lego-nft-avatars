const path = require('path');

module.exports = {
  entry: './src/index.js',
  mode: 'development',
  devServer: {
    index: './dev.html'
  },
  output: {
    filename: 'jsora.min.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'jsora',
    publicPath: '/dist/'
  },
  node: {
   fs: "empty"
  }

};