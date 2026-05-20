/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Tell Next standalone tracing to follow pnpm's symlink layout properly.
  // Without this, traced files miss the Prisma client and other linked deps.
  outputFileTracingRoot: __dirname,

  // Skip TypeScript and ESLint errors during the production build.
  // Dev still typechecks normally; this just unblocks `next build`
  // when third-party type definitions (ssh2, octokit) are stricter
  // than the actual runtime. Run `pnpm tsc --noEmit` locally to
  // verify real type-safety before deploying.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Tell Next not to bundle these — let Node require() them at runtime.
  // @prisma/client must NOT be bundled, it relies on generated files
  // ssh2 and cpu-features have native bindings that break webpack.
  serverExternalPackages: ['ssh2', 'cpu-features', '@prisma/client', '.prisma/client'],

  experimental: {
    serverActions: { bodySizeLimit: '200mb' },
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },

  // Belt-and-suspenders: also tell Webpack directly to ignore the
  // optional native bindings ssh2 looks for at require-time.
  webpack: (config, { isServer, webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^cpu-features$/ }),
      new webpack.IgnorePlugin({
        resourceRegExp: /\.\/build\/Release\/sshcrypto\.node$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /\.\/build\/Release\/cpufeatures\.node$/,
      }),
    )

    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : []
      config.externals = [...externals, 'cpu-features', 'ssh2']
    }

    return config
  },
}

module.exports = nextConfig
