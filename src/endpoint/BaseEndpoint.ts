import { FEnsureException, FException, FExceptionArgument, FExecutionContext, FExecutionContextLogger, FLogger } from "@freemework/common";
import { FHostingConfiguration, FServersBindEndpoint, FWebServer } from "@freemework/hosting";

import * as express from "express";

export abstract class BaseEndpoint extends FServersBindEndpoint {
	protected readonly _router: express.Router;

	public constructor(servers: ReadonlyArray<FWebServer>, opts: FHostingConfiguration.BindEndpoint) {
		super(servers, opts);
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

			const logger: FLogger = FExecutionContextLogger.of(this.initExecutionContext).logger;

			if (logger.isInfoEnabled) {
				logger.info(`Endpoint '${this._bindPath}' was assigned to server '${server.name}'.`);
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
					result.catch((e) => this.errorRenderer(FException.wrapIfNeeded(e), res));
				}
			} catch (e) {
				this.errorRenderer(FException.wrapIfNeeded(e), res);
			}
		};
		return handler;
	}

	protected errorRenderer(e: FException, res: express.Response): void {
		const logger: FLogger = FExecutionContextLogger.of(this.initExecutionContext).logger;

		if (logger.isWarnEnabled) {
			logger.warn(`Unhandled error on ${this.constructor.name}: ${e.message}`);
		} else {
			console.error(`Unhandled error on ${this.constructor.name}: ${e.message}`);
		}

		if (logger.isDebugEnabled) { 
			logger.debug(`Unhandled error on ${this.constructor.name}`, e); 
		}
		if (e instanceof FEnsureException) {
			res.writeHead(400, e.message).end();
		} else if (e instanceof FExceptionArgument) {
			res.writeHead(400, e.constructor.name).end();
		} else {
			res.writeHead(500).end();
		}
	}
}

/**
 * The error shows developer's issues. If this happens, go to dev team.
 */
export class BrokenEndpointError extends FException {
	//
}


