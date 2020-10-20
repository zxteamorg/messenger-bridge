import { Initable } from "@zxteam/disposable";
import { Inject, Provides, Singleton } from "@zxteam/launcher";
import { logger } from "@zxteam/logger";
import * as hosting from "@zxteam/hosting";

import * as express from "express";
import * as _ from "lodash";

import { ConfigurationProvider } from "./ConfigurationProvider";
import { Logger, CancellationToken } from "@zxteam/contract";

@Singleton
export abstract class HostingProvider extends Initable {
	public abstract get serverInstances(): ReadonlyArray<HostingProvider.ServerInstance>;

	protected readonly log: Logger;

	public constructor() {
		super();
		this.log = logger.getLogger("HostingProvider");
	}

	public abstract finalizeConfiguration(): void;
}
export namespace HostingProvider {
	export interface ServerInstance {
		readonly name: string;
		readonly server: hosting.WebServer;
		readonly isOwnInstance: boolean;
	}
}

@Provides(HostingProvider)
class HostingProviderImpl extends HostingProvider {
	@Inject
	private readonly configProvider!: ConfigurationProvider;

	private readonly _serverInstances: Array<{ name: string, server: hosting.WebServer, isOwnInstance: boolean }>;
	private readonly _destroyHandlers: Array<() => Promise<void>>;
	private _isConfigured: boolean;

	public constructor() {
		super();

		this.log.info("Constructing Web servers...");
		this._serverInstances = [...this.configProvider.servers.values()].map((serverOpts) => {
			if (hosting.instanceofWebServer(serverOpts)) {
				return { name: serverOpts.name, server: serverOpts, isOwnInstance: false };
			}

			const ownServerInstance = hosting.createWebServer(serverOpts, this.log);

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
				setupExpressErrorHandles(serverInstance.server.rootExpressApplication, this.log);
			}
		}
		this._isConfigured = true;
	}


	protected async onInit(cancellationToken: CancellationToken): Promise<void> {
		this.log.info("Initializing Web servers...");

		const serversMap: { readonly [serverName: string]: { server: hosting.WebServer, isOwnInstance: boolean } }
			= _.keyBy(this._serverInstances, "name");

		const { name: serviceName, version: serviceVersion } = require("../../package.json");

		try {
			for (const serverInfo of _.values(serversMap)) {
				if (this.log.isInfoEnabled) {
					this.log.info(`Start server: ${serverInfo.server.name}`);
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

				await serverInfo.server.init(cancellationToken);
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
		this.log.info("Disposinig Web servers...");
		let destroyHandler;
		while ((destroyHandler = this._destroyHandlers.pop()) !== undefined) {
			await destroyHandler();
		}
	}
}


export function setupExpressErrorHandles(app: express.Application, log: Logger): void {
	// 404 Not found (bad URL)
	app.use(function (req: express.Request, res: express.Response) { res.status(404).end("404 Not Found"); });

	// 5xx Fatal error
	app.use(function (err: any, req: express.Request, res: express.Response, next: express.NextFunction): any {
		if (err) {
			//TODO: send email, log err, etc...
			log.error(err);
		}
		//return res.status(500).end("500 Internal Error");
		return next(err); // use express exception render
	});
}
