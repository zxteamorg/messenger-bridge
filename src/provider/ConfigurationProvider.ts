import { Configuration as HostingConfiguration } from "@zxteam/hosting";
import { Provides, Singleton } from "@zxteam/launcher";

import * as _ from "lodash";

import { Configuration } from "../Configuration";
import { ApprovementTopic } from "../model/ApprovementTopic";

@Singleton
export abstract class ConfigurationProvider implements Configuration {
	abstract get approvement(): { readonly topics: ReadonlyMap<string, ApprovementTopic>; };
	abstract get endpoints(): ReadonlyArray<Configuration.Endpoint>;
	abstract get messengers(): ReadonlyMap<Configuration.Messenger["name"], Configuration.Messenger>;
	abstract get servers(): ReadonlyMap<HostingConfiguration.WebServer["name"], HostingConfiguration.WebServer>;
}

@Provides(ConfigurationProvider)
export class ConfigurationProviderImpl extends ConfigurationProvider {
	private readonly _cfg: Configuration;

	public constructor(configuration: Configuration) {
		super();
		this._cfg = configuration;
	}

	public get approvement(): { readonly topics: ReadonlyMap<string, ApprovementTopic>; } { return this._cfg.approvement; }
	public get endpoints(): ReadonlyArray<Configuration.Endpoint> { return this._cfg.endpoints; }
	public get messengers(): ReadonlyMap<Configuration.Messenger["name"], Configuration.Messenger> { return this._cfg.messengers; }
	public get servers(): ReadonlyMap<HostingConfiguration.WebServer["name"], HostingConfiguration.WebServer> { return this._cfg.servers; }
}
