/** @type {import('next').NextConfig} */
const nextConfig = {
  // shared UI package consumed from git as raw TS — Next transpiles it
  transpilePackages: ['@aivocado/mindsheet'],
};
module.exports = nextConfig;
