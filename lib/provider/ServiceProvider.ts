import { FInitableBase } from "@freemework/common";

import * as _ from "lodash";

import { Container, Provides, Singleton } from "typescript-ioc";

import { Service } from "../Service";
import { ConfigurationProvider } from "./ConfigurationProvider";

@Singleton
export abstract class ServiceProvider extends FInitableBase {
	public constructor() {
		super();
	}

	public abstract get service(): Service;
}

@Provides(ServiceProvider)
class ServiceProviderImpl extends ServiceProvider {
	private readonly _service: Service;

	public constructor() {
		super();
		const cfg: ConfigurationProvider = Container.get(ConfigurationProvider);
		this._service = new Service(cfg);
	}

	public get service(): Service {
		return this._service;
	}

	protected async onInit(): Promise<void> {
		await this._service.init(this.initExecutionContext);
	}

	protected async onDispose(): Promise<void> {
		await this._service.dispose();
	}
}
