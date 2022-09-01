import { FHostingConfiguration, FWebServer } from "@freemework/hosting";

import * as path from "path";
import * as express from "express";

import { BaseEndpoint } from "./BaseEndpoint";

export class WelcomePageEndpoint extends BaseEndpoint {
	public constructor(servers: ReadonlyArray<FWebServer>, opts: FHostingConfiguration.BindEndpoint) {
		super(servers, opts);

		const staticFilesDir: string = path.join(__dirname, "..", "..", "res", "WelcomePageEndpoint");

		this._router.use(express.static(staticFilesDir, { index: ["index.html"] }));
		this._router.use(function (req: express.Request, res: express.Response) {
			// 404 Not found
			res.status(404).sendFile(path.join(staticFilesDir, "404.html"));
		});
	}
}
