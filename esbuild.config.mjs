import esbuild from "esbuild";
import process from "node:process";

const prod = process.argv.includes("--production");

await esbuild.build({
	entryPoints: ["main.ts"],
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	external: ["obsidian"],
});
