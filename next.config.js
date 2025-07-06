// next.config.js
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // By default Next.js uses SWC for both compilation and minification,
  // so you don't need to explicitly set swcMinify unless you want to disable it.
  // swcMinify: true,  // <-- optional, defaults to true blah
};

module.exports = nextConfig; 
