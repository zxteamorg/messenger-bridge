import { FExecutionContextLogger, FInitable, FInitableBase, FLogger } from "@freemework/common";

import * as _ from "lodash";
import { Container, Provides, Singleton } from "typescript-ioc";

// Providers
import { ConfigurationProvider } from "./ConfigurationProvider";
import { HostingProvider } from "./HostingProvider";

// Endpoints
import { RestEndpoint } from "../endpoint/RestEndpoint";
import { WelcomePageEndpoint } from "../endpoint/WelcomePageEndpoint";
import { WSEndpoint } from "../endpoint/WSEndpoint";
import { ServiceProvider } from "./ServiceProvider";

@Singleton
export abstract class EndpointsProvider extends FInitableBase {
	public constructor() {
		super();
	}
}

@Provides(EndpointsProvider)
class EndpointsProviderImpl extends EndpointsProvider {
	private readonly _endpointInstances: Array<FInitable>;
	private readonly _destroyHandlers: Array<() => Promise<void>>;

	public constructor() {
		super();

		const configurationProvider: ConfigurationProvider = Container.get(ConfigurationProvider);
		const hostingProvider: HostingProvider = Container.get(HostingProvider);
		const serviceProvider: ServiceProvider = Container.get(ServiceProvider);

		this._endpointInstances = [];
		for (const endpoint of configurationProvider.endpoints) {
			const endpointServers = hostingProvider.serverInstances
				.filter(s => endpoint.servers.includes(s.name)).map(si => si.server);

			switch (endpoint.type) {
				case "rest": {
					const endpointInstance: RestEndpoint = new RestEndpoint(
						endpointServers, endpoint, serviceProvider.service
					);
					this._endpointInstances.push(endpointInstance);
					break;
				}
				case "welcome-page": {
					const endpointInstance: WelcomePageEndpoint = new WelcomePageEndpoint(
						endpointServers, endpoint
					);
					this._endpointInstances.push(endpointInstance);
					break;
				}
				case "websocket": {
					const endpointInstance: WSEndpoint = new WSEndpoint(
						endpointServers, endpoint, serviceProvider.service
					);
					this._endpointInstances.push(endpointInstance);
					break;
				}
				default:
					throw new UnreachableEndpointError(endpoint);
			}
		}

		this._destroyHandlers = [];
	}

	protected async onInit(): Promise<void> {
		const logger: FLogger = FExecutionContextLogger.of(this.initExecutionContext).logger;

		logger.info("Initializing endpoints...");
		try {
			for (const endpointInstance of this._endpointInstances) {
				await endpointInstance.init(this.initExecutionContext);
				this._destroyHandlers.push(() => endpointInstance.dispose());
			}
		} catch (e) {
			let destroyHandler;
			while ((destroyHandler = this._destroyHandlers.pop()) !== undefined) {
				await destroyHandler();
			}
			throw e;
		}
	}

	protected async onDispose(): Promise<void> {
		const logger: FLogger = FExecutionContextLogger.of(this.initExecutionContext).logger;

		logger.info("Destroying endpoints...");
		let destroyHandler;
		while ((destroyHandler = this._destroyHandlers.pop()) !== undefined) {
			await destroyHandler();
		}
	}
}

class UnreachableEndpointError extends Error {
	public constructor(endpoint: never) {
		super(`Not supported endpoint: ${JSON.stringify(endpoint)}`);
	}
}
