import { FExecutionContextLogger, FInitableBase, FLogger } from "@freemework/common";
import { createWebServer, FWebServer, instanceofWebServer } from "@freemework/hosting";

import * as express from "express";
import * as _ from "lodash";
import { Container, Provides, Singleton } from "typescript-ioc";

import { ConfigurationProvider } from "./ConfigurationProvider";

@Singleton
export abstract class HostingProvider extends FInitableBase {
	public abstract get serverInstances(): ReadonlyArray<HostingProvider.ServerInstance>;

	public constructor() {
		super();
	}

	public abstract finalizeConfiguration(): void;
}
export namespace HostingProvider {
	export interface ServerInstance {
		readonly name: string;
		readonly server: FWebServer;
		readonly isOwnInstance: boolean;
	}
}

@Provides(HostingProvider)
class HostingProviderImpl extends HostingProvider {
	private readonly configProvider!: ConfigurationProvider;

	private readonly _serverInstances: Array<{ name: string, server: FWebServer, isOwnInstance: boolean }>;
	private readonly _destroyHandlers: Array<() => Promise<void>>;
	private _isConfigured: boolean;

	public constructor() {
		super();

		this.configProvider = Container.get(ConfigurationProvider);

		this._serverInstances = [...this.configProvider.servers.values()].map((serverOpts) => {
			if (instanceofWebServer(serverOpts)) {
				return { name: serverOpts.name, server: serverOpts, isOwnInstance: false };
			}

			const ownServerInstance = createWebServer(serverOpts);

			return Object.freeze({ name: ownServerInstance.name, server: ownServerInstance, isOwnInstance: true });
		});
		this._destroyHandlers = [];
		this._isConfigured = false;
	}

	public get serverInstances(): ReadonlyArray<HostingProvider.ServerInstance> {
		return Object.freeze(this._serverInstances);
	}

	public finalizeConfiguration(): void {
		for (const serverInstance of _.values(this._serverInstances)) {
			if (serverInstance.isOwnInstance === true) {
				setupExpressErrorHandles(serverInstance.server.rootExpressApplication);
			}
		}
		this._isConfigured = true;
	}


	protected async onInit(): Promise<void> {
		const logger: FLogger = FExecutionContextLogger.of(this.initExecutionContext).logger;

		logger.info("Initializing Web servers...");

		const serversMap: { readonly [serverName: string]: { server: FWebServer, isOwnInstance: boolean } }
			= _.keyBy(this._serverInstances, "name");

		const { name: serviceName, version: serviceVersion } = require("../../package.json");

		try {
			for (const serverInfo of _.values(serversMap)) {
				if (logger.isInfoEnabled) {
					logger.info(`Start server: ${serverInfo.server.name}`);
				}

				const expressApplication = serverInfo.server.rootExpressApplication;
				expressApplication.enable("case sensitive routing"); // "/Foo" and "/foo" should be different routes
				expressApplication.enable("strict routing"); // the router should treat "/foo" and "/foo/" as different.

				if (!("NODE_ENV" in process.env) || process.env.NODE_ENV === "production") {
					expressApplication.set("env", "production"); // by default use production mode
					expressApplication.disable("x-powered-by"); // Hide real www server (security reason)
				} else {
					expressApplication.set("json spaces", 4);
				}

				expressApplication.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
					if (this._isConfigured !== true) {
						return res.writeHead(503, "Service temporary unavailable. Please wait. Launching...").end();
					} else {
						next();
					}
				});

				await serverInfo.server.init(this.initExecutionContext);
				this._destroyHandlers.push(() => serverInfo.server.dispose().catch(console.error));
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

		logger.info("Disposinig Web servers...");

		let destroyHandler;
		while ((destroyHandler = this._destroyHandlers.pop()) !== undefined) {
			await destroyHandler();
		}
	}
}


export function setupExpressErrorHandles(app: express.Application): void {
	// 404 Not found (bad URL)
	app.use(function (req: express.Request, res: express.Response) { res.status(404).end("404 Not Found"); });

	// 5xx Fatal error
	app.use(function (err: any, req: express.Request, res: express.Response, next: express.NextFunction): any {
		if (err) {
			//TODO: send email, log err, etc...
			console.error(err);
		}
		//return res.status(500).end("500 Internal Error");
		return next(err); // use express exception render
	});
}
