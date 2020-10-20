import { Logger, CancellationToken } from "@zxteam/contract";
import { Initable } from "@zxteam/disposable";
import { Container, Provides, Singleton } from "@zxteam/launcher";
import { logger } from "@zxteam/logger";

import * as _ from "lodash";

import { Service } from "../Service";
import { ConfigurationProvider } from "./ConfigurationProvider";

@Singleton
export abstract class ServiceProvider extends Initable {
	protected readonly log: Logger;

	public constructor() {
		super();
		this.log = logger.getLogger("ServiceProvider");
	}

	public abstract get service(): Service;
}

@Provides(ServiceProvider)
class ServiceProviderImpl extends ServiceProvider {
	private readonly _service: Service;

	public constructor() {
		super();
		const cfg: ConfigurationProvider = Container.get(ConfigurationProvider);
		this._service = new Service(cfg, this.log.getLogger(Service.name));
	}

	public get service(): Service {
		return this._service;
	}

	protected async onInit(cancellationToken: CancellationToken): Promise<void> {
		await this._service.init(cancellationToken);
	}

	protected async onDispose(): Promise<void> {
		await this._service.dispose();
	}
}
