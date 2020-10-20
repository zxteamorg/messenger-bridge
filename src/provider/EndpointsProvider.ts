import { Logger, CancellationToken } from "@zxteam/contract";
import { Initable } from "@zxteam/disposable";
import { Container, Inject, Provides, Singleton } from "@zxteam/launcher";
import { logger } from "@zxteam/logger";

import * as _ from "lodash";

// Providers
import { ConfigurationProvider } from "./ConfigurationProvider";
import { HostingProvider } from "./HostingProvider";

// Endpoints
import { RestEndpoint } from "../endpoint/RestEndpoint";
import { WelcomePageEndpoint } from "../endpoint/WelcomePageEndpoint";
import { WSEndpoint } from "../endpoint/WSEndpoint";
import { ServiceProvider } from "./ServiceProvider";

@Singleton
export abstract class EndpointsProvider extends Initable {
	protected readonly log: Logger;

	public constructor() {
		super();
		this.log = logger.getLogger("EndpointsProvider");
	}
}

@Provides(EndpointsProvider)
class EndpointsProviderImpl extends EndpointsProvider {
	private readonly _endpointInstances: Array<Initable>;
	private readonly _destroyHandlers: Array<() => Promise<void>>;

	public constructor() {
		super();

		this.log.info("Constructing endpoints...");

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
						endpointServers, endpoint,
						this.log.getLogger(endpoint.type + ":" + endpoint.bindPath),
						serviceProvider.service
					);
					this._endpointInstances.push(endpointInstance);
					break;
				}
				case "welcome-page": {
					const endpointInstance: WelcomePageEndpoint = new WelcomePageEndpoint(
						endpointServers, endpoint,
						this.log.getLogger(endpoint.type + ":" + endpoint.bindPath)
					);
					this._endpointInstances.push(endpointInstance);
					break;
				}
				case "websocket": {
					const endpointInstance: WSEndpoint = new WSEndpoint(
						endpointServers, endpoint,
						this.log.getLogger(endpoint.type + ":" + endpoint.bindPath),
						serviceProvider.service
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

	protected async onInit(cancellationToken: CancellationToken): Promise<void> {
		this.log.info("Initializing endpoints...");
		try {
			for (const endpointInstance of this._endpointInstances) {
				await endpointInstance.init(cancellationToken);
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
		this.log.info("Destroying endpoints...");
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
