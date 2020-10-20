import { CancellationToken, Logger } from "@zxteam/contract";
import { Disposable, Initable } from "@zxteam/disposable";
import { Container, Runtime } from "@zxteam/launcher";
import { logger } from "@zxteam/logger";

import * as _ from "lodash";

import { ConfigurationProvider, ConfigurationProviderImpl } from "./provider/ConfigurationProvider";
import { Configuration } from "./Configuration";
import { ServiceProvider } from "./provider/ServiceProvider";
import { HostingProvider } from "./provider/HostingProvider";
import { EndpointsProvider } from "./provider/EndpointsProvider";

export { Configuration } from "./Configuration";

export default async function (cancellationToken: CancellationToken, configuration?: Configuration): Promise<Runtime> {
	const log: Logger = logger.getLogger("Runtime Factory");

	if (configuration !== undefined) {
		log.info("Initializing ConfigurationProvider...");
		const ownProvider: ConfigurationProvider = new ConfigurationProviderImpl(configuration);
		Container.bind(ConfigurationProvider).provider({ get() { return ownProvider; } });
	} else {
		log.info("Using ConfigurationProvider provided by user...");
	}

	log.info("Compose application DI Runtime...");
	// https://www.manning.com/books/dependency-injection-principles-practices-patterns

	//const configurationProvider: ConfigurationProvider = Container.get(ConfigurationProvider);
	const serviceProvider: ServiceProvider = Container.get(ServiceProvider);
	const hostingProvider: HostingProvider = Container.get(HostingProvider);
	const endpointsProvider: EndpointsProvider = Container.get(EndpointsProvider);

	log.info("Initializing DI Runtime...");
	await Initable.initAll(cancellationToken,
		hostingProvider, // first (HTTP 503 while not endpoints)
		serviceProvider,
		endpointsProvider // endpointsProvider should last (this will return 503 before initialization)
	);

	hostingProvider.finalizeConfiguration();
	return Object.freeze({
		async destroy() {
			log.info("Destroying DI Runtime...");
			await Disposable.disposeAll(
				endpointsProvider, // endpointsService should dispose first (disable new connections, but wait for finish active ones. HTTP 503)
				serviceProvider,
				hostingProvider // Last (503 response while shutdown completed)
			);
		}
	});
}
