"use strict";

const path = require("path");
const execa = require("execa");
const { sync: spawnSync } = execa;
const { Writable } = require("readable-stream");

const WEBPACK_PATH = path.resolve(__dirname, "../bin/cli.js");

/**
 * Description
 *
 * @param {*} testCase The path to folder that contains the webpack.config.js
 * @param {*} args Array of arguments to pass to webpack
 * @returns {Object} The webpack output
 */
function run(testCase, args = []) {
	const cwd = path.resolve(testCase);

	const outputPath = path.resolve(testCase, "bin");
	const argsWithOutput = args.concat("--output-path", outputPath);

	const result = spawnSync(WEBPACK_PATH, argsWithOutput, {
		cwd,
		reject: false
	});

	return result;
}

function runWatch(testCase, args = []) {
	const cwd = path.resolve(testCase);

	const outputPath = path.resolve(testCase, "bin");
	const argsWithOutput = args.concat("--output-path", outputPath);

	return new Promise(resolve => {
		const watchPromise = execa(WEBPACK_PATH, argsWithOutput, {
			cwd,
			reject: false
		});

		watchPromise.stdout.pipe(
			new Writable({
				write(chunk, encoding, callback) {
					const output = chunk.toString("utf8");

					if (output.includes("Time")) {
						watchPromise.kill();
					}

					callback();
				}
			})
		);
		watchPromise.then(result => {
			resolve(result);
		});
	});
}

function extractSummary(stdout) {
	if (stdout === "") {
		return "";
	}
	return stdout
		.split("\n")
		.filter(line => !line.includes("Hash"))
		.filter(line => !line.includes("Version"))
		.filter(line => !line.includes("Time"))
		.filter(line => !line.includes("Built at"))
		.join("\n");
}

/**
 * @typedef {Object} Config
 * @property {string} name - name of config
 * @property {string} hash - hash of config
 *
 * @typedef {Object} HashInfo
 * @property {string} hash - global hash value
 * @property {Array.<Config>} config
 */

/**
 * Description
 *
 * @param {string} stdout stdout of generic webpack output
 * @returns {HashInfo} - an object containing hash-info
 * @throws Will throw an error if {@link stdout}
 * 		- is empty
 * 		- does not contain Hash
 *      - does not contain Hash
 * 		- if multiple configs then, count(hash) !== count(Child) + 1 (+1 is for global hash)
 *
 */
function extractHash(stdout) {
	if (stdout === "") {
		throw new Error("stdout is empty");
	}

	let hashArray = stdout.match(/Hash.*/gm);

	// If logs are full of errors and we don't find hash
	if (!hashArray) {
		throw new Error(
			`could not find hash in the stdout
			OUTPUT: ${stdout}`
		);
	}

	hashArray = hashArray.map(hashLine => hashLine.replace(/Hash:(.*)/, "$1").trim());

	const hashInfo = {
		hash: hashArray[0],
		config: []
	};

	// Multiple config were found
	if (hashArray.length > 1) {
		let childArray = stdout.match(/Child.*/gm);

		if (!childArray) {
			throw new Error(
				`could not find config in the stdout
				OUTPUT: ${stdout}`
			);
		}

		childArray = childArray.map(childLine => childLine.replace(/Child(.*):/, "$1").trim());

		// We don't need global hash anymore
		// so we'll remove it to maintain 1:1 parity between config and hash
		hashArray.shift();
		if (hashArray.length !== childArray.length) {
			throw new Error(`The stdout is corrupted. Hash count and config count do not match.
			OUTPUT: ${stdout}`);
		}
		const configCount = childArray.length;
		for (let configIdx = 0; configIdx < configCount; configIdx++) {
			hashInfo["config"].push({
				name: childArray[configIdx],
				hash: hashArray[configIdx]
			});
		}
	}

	return hashInfo;
}

/*eslint valid-jsdoc: ["error", { "requireReturn": false }]*/
/**
 *
 * @param {*} testCase - testCase directory
 * @param {*} file - file relative to testCase
 * @param {*} data - data to append
 * @throws - throw an Error if file does not exist
 */
function appendDataIfFileExists(testCase, file, data) {
	const { existsSync, appendFileSync } = require("fs");

	const filePath = path.resolve(testCase, file);
	if (existsSync(filePath)) {
		appendFileSync(filePath, data);
	} else {
		throw new Error(`Oops! ${filePath} does not exist!`);
	}
}

module.exports = { run, runWatch, extractHash, extractSummary, appendDataIfFileExists };
