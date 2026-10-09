// webpack-bundle-analyzer 5 no longer ships types and the DefinitelyTyped
// package targets 4.x; only the plugin constructor is used (webpack.production.ts).
declare module 'webpack-bundle-analyzer' {
  import type { WebpackPluginInstance } from 'webpack'

  export class BundleAnalyzerPlugin implements WebpackPluginInstance {
    public constructor(options?: {
      readonly analyzerMode?: 'server' | 'static' | 'json' | 'disabled'
      readonly reportFilename?: string
      readonly openAnalyzer?: boolean
      readonly [option: string]: unknown
    })
    public apply(compiler: import('webpack').Compiler): void
  }
}
