/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@job-ops/db',
    '@job-ops/domain',
    '@job-ops/contracts',
    '@job-ops/readiness',
    '@job-ops/tailoring',
    '@job-ops/needle-worker',
    '@job-ops/scout-worker',
  ],
};

export default nextConfig;
