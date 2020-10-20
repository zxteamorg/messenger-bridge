import { Logger } from "@zxteam/contract";
import { EnsureError } from "@zxteam/ensure";
import { ArgumentError, wrapErrorIfNeeded, InnerError } from "@zxteam/errors";
import { Configuration as HostingConfiguration, ServersBindEndpoint, WebServer } from "@zxteam/hosting";

import * as express from "express";

export abstract class BaseEndpoint extends ServersBindEndpoint {
	protected readonly _router: express.Router;

	public constructor(servers: ReadonlyArray<WebServer>, opts: HostingConfiguration.BindEndpoint, log: Logger) {
		super(servers, opts, log);
		this._router = express.Router();
		this._router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
			if (this.disposing || this.disposed) {
				return res.writeHead(503, "Service temporary unavailable. Going to maintenance...").end();
			} else {
				next();
			}
		});
	}

	protected onInit(): void {
		for (const server of this._servers) {
			const rootExpressApplication = server.rootExpressApplication;
			rootExpressApplication.use(this._bindPath, this._router);

			if (this._log.isInfoEnabled) {
				this._log.info(`Endpoint '${this._bindPath}' was assigned to server '${server.name}'.`);
			}
		}
	}

	protected onDispose(): void {
		//
	}

	protected safeBinder(cb: (req: express.Request, res: express.Response) => (void | Promise<void>)) {
		const handler = (req: express.Request, res: express.Response): void => {
			try {
				const result = cb(req, res);
				if (result instanceof Promise) {
					result.catch((e) => this.errorRenderer(wrapErrorIfNeeded(e), res));
				}
			} catch (e) {
				this.errorRenderer(wrapErrorIfNeeded(e), res);
			}
		};
		return handler;
	}

	protected errorRenderer(e: Error, res: express.Response): void {
		if (this._log.isWarnEnabled) {
			this._log.warn(`Unhandled error on ${this.constructor.name}: ${e.message}`);
		} else {
			console.error(`Unhandled error on ${this.constructor.name}: ${e.message}`);
		}
		if (this._log.isDebugEnabled) { this._log.debug(`Unhandled error on ${this.constructor.name}`, e); }
		if (e instanceof EnsureError) {
			res.writeHead(400, e.message).end();
		} else if (e instanceof ArgumentError) {
			res.writeHead(400, e.constructor.name).end();
		} else {
			res.writeHead(500).end();
		}
	}
}

/**
 * The error shows developer's issues. If this happens, go to dev team.
 */
export class BrokenEndpointError extends InnerError {
	//
}


