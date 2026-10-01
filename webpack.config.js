const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const {EsbuildPlugin} = require("esbuild-loader");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");

// 素材放在源码的 assets/ 下，打包后落到包根：集市只认包根的 icon.png / preview.png
const packageImages = ["icon.png", "preview.png"].map((name) => ({
    from: `assets/${name}`,
    to: "./dist/",
    noErrorOnMissing: true,
}));

module.exports = (env, argv) => {
    const production = argv.mode === "production";
    const plugins = [
        new MiniCssExtractPlugin({
            filename: production ? "dist/index.css" : "index.css",
        }),
    ];
    if (production) {
        plugins.push(
            new webpack.BannerPlugin({
                banner: () => fs.readFileSync("LICENSE").toString(),
            }),
        );
        plugins.push(
            new CopyPlugin({
                patterns: [
                    ...packageImages,
                    {from: "README*.md", to: "./dist/"},
                    // 文档同时打进包里（index.js 里已经内嵌了一份，这里是给用户直接翻阅的原文件）
                    {from: "docs/", to: "./dist/docs/"},
                    {from: "plugin.json", to: "./dist/"},
                    {from: "src/i18n/", to: "./dist/i18n/"},
                ],
            }),
        );
        plugins.push(
            new ZipPlugin({
                filename: "package.zip",
                algorithm: "gzip",
                include: [/dist/],
                pathMapper: (assetPath) => assetPath.replace("dist/", ""),
            }),
        );
    } else {
        // 开发模式只写仓库根的 index.js / index.css / i18n/，供本机插件目录直接加载
        plugins.push(
            new CopyPlugin({
                patterns: [
                    {from: "src/i18n/", to: "./i18n/"},
                ],
            }),
        );
    }
    return {
        mode: argv.mode || "development",
        watch: !production,
        devtool: production ? false : "eval-source-map",
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname),
            libraryTarget: "commonjs2",
            library: {
                type: "commonjs2",
            },
        },
        // siyuan 由宿主注入，绝不打包
        externals: {
            siyuan: "siyuan",
        },
        entry: {
            [production ? "dist/index" : "index"]: "./src/index.ts",
        },
        optimization: {
            minimize: production,
            minimizer: [
                new EsbuildPlugin(),
            ],
        },
        resolve: {
            extensions: [".ts", ".scss", ".js", ".json"],
        },
        module: {
            rules: [
                {
                    test: /\.ts(x?)$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [
                        {
                            loader: "esbuild-loader",
                            options: {
                                target: "es6",
                            },
                        },
                    ],
                },
                {
                    test: /\.scss$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: "css-loader",
                        },
                        {
                            loader: "sass-loader",
                        },
                    ],
                },
                {
                    // docs/ 里的文档作为字符串内嵌进 index.js，编辑窗口的文档弹窗离线也能看
                    test: /\.md$/,
                    include: [path.resolve(__dirname, "docs")],
                    type: "asset/source",
                },
            ],
        },
        plugins,
    };
};
