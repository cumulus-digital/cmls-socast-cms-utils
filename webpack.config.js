const webpack = require('webpack');
const { ModuleFederationPlugin } = require('webpack').container;
const { basename, dirname, resolve } = require('path');
const browserslist = require('browserslist');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const postCSSPlugins = require('@wordpress/postcss-plugins-preset');
const path = require('path');
const fs = require('fs');

const __BUILDDATE__ = new Date().toString();

module.exports = (env) => {
	const isProduction = env.NODE_ENV === 'production';
	const mode = isProduction ? 'production' : 'development';
	const fromConfigRoot = (fileName) =>
		path.join(path.dirname(__dirname), 'config', fileName);

	let target = 'browserslist';
	if (!browserslist.findConfig('.')) {
		target += ':' + fromConfigRoot('.browserslistrc');
	}

	// App directory
	const appDirectory = fs.realpathSync(process.cwd());

	// Gets absolute path of file within app directory
	const resolveAppPath = (relativePath) =>
		path.resolve(appDirectory, relativePath);

	const host = process.env.HOST || 'localhost';

	const cssLoaders = [
		{
			loader: require.resolve('style-loader'),
			options: {
				injectType: 'lazyAutoStyleTag',
				insert: require.resolve('./src/utils/style-loader-insert.js'),
			},
		},
		{
			loader: require.resolve('css-loader'),
			options: {
				sourceMap: !isProduction,
				modules: {
					auto: true,
				},
			},
		},
		{
			loader: require.resolve('postcss-loader'),
			options: {
				postcssOptions: {
					ident: 'postcss',
					sourceMap: !isProduction,
					plugins: isProduction
						? [
								...postCSSPlugins,
								require('cssnano')({
									preset: [
										'default',
										{
											discardComments: {
												removeAll: true,
											},
										},
									],
								}),
							]
						: postCSSPlugins,
				},
			},
		},
	];

	return {
		mode,
		target: target,
		devtool: isProduction ? false : 'source-map',
		entry: () => {
			const entries = {
				bundle: './src/bundle.js',
				main: './src/main.js',
				functionality: './src/functionality.js',
				advertising: './src/advertising.js',
				analytics: './src/analytics.js',
			};
			return { ...entries };
		},
		output: {
			filename: '[name].js',
			chunkFilename: '[name].[chunkhash].js',
			sourceMapFilename: '[name].[chunkhash].map',
			path: resolve(process.cwd(), 'dist'),
			chunkLoadingGlobal: 'cmlsAmpUtils',
		},
		resolve: {
			alias: {
				react: 'h',
				'react-dom': 'h',
				'react/jsx-runtime': 'h',
				'lodash-es': 'lodash',
				Utils: path.resolve(__dirname, 'src/utils'),
			},
			extensions: ['.jsx', '.ts', '.tsx', '...'],
		},
		optimization: {
			// Only concatenate modules in production, when not analyzing bundles.
			concatenateModules: isProduction,
			minimize: isProduction,
			minimizer: [
				new TerserPlugin({
					parallel: true,
					terserOptions: {
						compress: {
							passes: 5,
						},
						sourceMap: true,
					},
					extractComments: false,
				}),
			],
			concatenateModules: true,
			splitChunks: {
				chunks: 'async',
				cacheGroups: {
					vendors: {
						name: 'vendors',
						test: /[\\/]node_modules[\\/]/,
						priority: -10,
						chunks: (chunk) =>
							![
								'main',
								'advertising',
								'analytics',
								'functionality',
							].includes(chunk.name),
						reuseExistingChunk: true,
					},
				},
			},
		},
		module: {
			rules: [
				{
					test: /\.(j|t)sx?$/,
					exclude: /(node_modules|bower_components)/,
					use: {
						loader: require.resolve('babel-loader'),
						options: {
							babelrc: true,
							configFile: true,
							presets: [
								'@babel/preset-react',
								[
									'@babel/preset-env',
									{
										loose: true,
										debug: true,
										useBuiltIns: 'usage',
										corejs: require('core-js/package.json')
											.version,
									},
								],
							],
							plugins: [
								['@babel/plugin-transform-runtime'],
								[
									'@babel/plugin-transform-react-jsx',
									{
										pragma: 'h',
										pragmaFrag: 'Fragment',
									},
								],
							],
						},
					},
				},
				{
					test: /\.css$/,
					use: cssLoaders,
				},
				{
					test: /\.(sc|sa)ss$/,
					use: [
						...cssLoaders,
						{
							loader: require.resolve('sass-loader'),
							options: {
								sourceMap: !isProduction,
								api: 'modern',
								sassOptions: {
									//importer: jsonInSassImporter(),
								},
							},
						},
					],
				},
			],
		},
		plugins: [
			new webpack.DefinePlugin({
				__BUILDDATE__: JSON.stringify(__BUILDDATE__),
			}),
			new ModuleFederationPlugin({
				runtime: 'cmls-amp-utils',
				shared: [
					'vendors',
					'core-js',
					'lodash',
					'style-loader',
					'css-loader',
					'postcss-loader',
					'sass-loader',
					'main',
				],
			}),
			new CleanWebpackPlugin({
				cleanAfterEveryBuildPatterns: ['!fonts/**', '!images/**'],
				// Prevent it from deleting webpack assets during builds that have
				// multiple configurations returned in the webpack config.
				cleanStaleWebpackAssets: false,
			}),
		],
		devServer: {
			// Serve index.html as the base
			static: resolveAppPath('./'),

			// Enable compression
			compress: true,

			// Enable hot reloading
			hot: false,

			host,

			port: 3000,

			allowedHosts: 'all',

			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods':
					'GET, POST, PUT, DELETE, PATCH, OPTIONS',
				'Access-Control-Allow-Headers':
					'X-Requested-With, content-type, Authorization',
			},

			client: { overlay: false },
		},
		watchOptions: {
			poll: 1000,
		},
	};
};
