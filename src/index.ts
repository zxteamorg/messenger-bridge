import { FDisposable, FExecutionContext, FExecutionContextLogger, FInitable, FLogger } from "@freemework/common";

import * as _ from "lodash";
import { Container } from "typescript-ioc";

import { ConfigurationProvider, ConfigurationProviderImpl } from "./provider/ConfigurationProvider";
import { Configuration } from "./Configuration";
import { ServiceProvider } from "./provider/ServiceProvider";
import { HostingProvider } from "./provider/HostingProvider";
import { EndpointsProvider } from "./provider/EndpointsProvider";
import { FLauncherRuntime } from "@freemework/hosting";

export { Configuration } from "./Configuration";

export default async function (executionContext: FExecutionContext, configuration?: Configuration): Promise<FLauncherRuntime> {
	const logger: FLogger = FExecutionContextLogger.of(executionContext).logger;

	if (configuration !== undefined) {
		logger.info("Initializing ConfigurationProvider...");
		const ownProvider: ConfigurationProvider = new ConfigurationProviderImpl(configuration);
		Container.bind(ConfigurationProvider).provider({ get() { return ownProvider; } });
	} else {
		logger.info("Using ConfigurationProvider provided by user...");
	}

	logger.info("Compose application DI Runtime...");
	// https://www.manning.com/books/dependency-injection-principles-practices-patterns

	//const configurationProvider: ConfigurationProvider = Container.get(ConfigurationProvider);
	const serviceProvider: ServiceProvider = Container.get(ServiceProvider);
	const hostingProvider: HostingProvider = Container.get(HostingProvider);
	const endpointsProvider: EndpointsProvider = Container.get(EndpointsProvider);

	logger.info("Initializing DI Runtime...");
	await FInitable.initAll(executionContext,
		hostingProvider, // first (HTTP 503 while not endpoints)
		serviceProvider,
		endpointsProvider // endpointsProvider should last (this will return 503 before initialization)
	);

	hostingProvider.finalizeConfiguration();
	return Object.freeze({
		async destroy() {
			logger.info("Destroying DI Runtime...");
			await FDisposable.disposeAll(
				endpointsProvider, // endpointsService should dispose first (disable new connections, but wait for finish active ones. HTTP 503)
				serviceProvider,
				hostingProvider // Last (503 response while shutdown completed)
			);
		}
	});
}
