#!/usr/bin/env node

const { Container, launcher, registerShutdownHook } = require("@zxteam/launcher");

const fs = require("fs");

const { default: runtimeFactory, Configuration } = require("..");


// Contract providers
//

// Implementation providers
//

console.log(fs.readFileSync(__filename.replace(/.js$/, ".logo")).toString());
const { name: serviceName, version: serviceVersion } = require("../package.json");
console.log(`Package: ${serviceName}@${serviceVersion}\n`);


// DI Configuration
//

registerShutdownHook(async function () {
	await new Promise(function (resolve) {
		function guardForMissingLoggerCallback() {
			// This guard resolve promise, if log4js does not call shutdown callback
			resolve();
		}
		const timeout = setTimeout(guardForMissingLoggerCallback, 5000);
		require('log4js').shutdown(function (log4jsErr) {
			if (log4jsErr) {
				console.error("Failure log4js.shutdown:", log4jsErr);
			}
			clearTimeout(timeout);
			resolve();
		});
	});
});

launcher(Configuration.parse, runtimeFactory);
