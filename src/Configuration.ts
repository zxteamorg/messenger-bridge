import { Configuration as RawConfiguration } from "@zxteam/contract";
import { ConfigurationError, InvalidOperationError } from "@zxteam/errors";
import { Configuration as HostingConfiguration } from "@zxteam/hosting";

import * as _ from "lodash";
import { ApprovementTopicName } from "./model/Primitives";
import { ApprovementTopic } from "./model/ApprovementTopic";

export interface Configuration {
	readonly servers: ReadonlyMap<HostingConfiguration.WebServer["name"], HostingConfiguration.WebServer>;
	readonly endpoints: ReadonlyArray<Configuration.Endpoint>;
	readonly messengers: ReadonlyMap<Configuration.Messenger["name"], Configuration.Messenger>;
	readonly approvement: {
		readonly topics: ReadonlyMap<ApprovementTopicName, ApprovementTopic>;
	};
}

export namespace Configuration {
	export type Endpoint = RestEndpoint | WebSocketEndpoint;

	export interface RestEndpoint extends HostingConfiguration.BindEndpoint, HostingConfiguration.ServerEndpoint {
		readonly type: "rest" | "welcome-page";
		readonly cors: Cors | null;
	}
	export interface WebSocketEndpoint
		extends HostingConfiguration.WebSocketEndpoint, HostingConfiguration.ServerEndpoint {
		readonly type: "websocket";
	}

	export interface Cors {
		readonly methods: ReadonlyArray<string>;
		readonly whiteList: ReadonlyArray<string>;
		readonly allowedHeaders: ReadonlyArray<string>;
	}

	export namespace Messenger {
		export namespace Common {
			export interface ApprovementTopicBinding {
				readonly bindTopic: ApprovementTopicName;
				readonly renderTemplate: string;
			}
		}
		export interface Common {
			readonly type: string;
			readonly name: string;
			readonly approvementTopicBindings: ReadonlyMap<
				ApprovementTopicName,
				Common.ApprovementTopicBinding
			>;
		}
		export interface Slack extends Common {
			readonly type: "slack";
			// TODO
		}
		export namespace Telegram {
			export interface ApprovementTopicBinding extends Common.ApprovementTopicBinding {
				readonly chatId: string;
				readonly approvers: Set<string> | null;
			}
		}
		export interface Telegram extends Common {
			readonly type: "telegram";
			readonly apiToken: string;
			readonly approvementTopicBindings: ReadonlyMap<
				ApprovementTopicName,
				Telegram.ApprovementTopicBinding
			>;
		}

		export class UnreachableMessengerType extends ConfigurationError {
			public constructor(messenger: never) {
				super(`Wrong messenger type: ${JSON.stringify(messenger)}.`, "type", null);
			}
		}
	}
	export type Messenger = Messenger.Slack | Messenger.Telegram;


	export function parse(configuration: RawConfiguration): Configuration {
		const runtimeConfiguration: RawConfiguration = configuration;

		const endpoints = runtimeConfiguration.getString("endpoint_indexer").split(" ")
			.map((endpointIndex: string): Configuration.Endpoint => parseEndpoint(runtimeConfiguration, endpointIndex));

		const appConfig: Configuration = Object.freeze({
			servers: parseServers(runtimeConfiguration),
			endpoints: Object.freeze(endpoints),
			messengers: parseMessengers(runtimeConfiguration),
			approvement: {
				topics: parseApprovementTopics(runtimeConfiguration.getNamespace("approvement"))
			}
		});

		return appConfig;
	}

	export function parseEndpoint(configuration: RawConfiguration, endpointIndex: string): Configuration.Endpoint {
		const endpointConfiguration: RawConfiguration = configuration.getNamespace(`endpoint.${endpointIndex}`);
		const endpointType = endpointConfiguration.getString("type") as Configuration.Endpoint["type"];
		switch (endpointType) {
			case "rest":
			case "welcome-page": {
				const httpsEndpoint: Configuration.RestEndpoint = {
					type: endpointType,
					servers: endpointConfiguration.getString("servers").split(" "),
					bindPath: endpointConfiguration.getString("bindPath", "/"),
					cors: endpointConfiguration.hasNamespace("cors") ? parseCors(endpointConfiguration.getNamespace("cors")) : null
				};
				return httpsEndpoint;
			}
			case "websocket": {
				const webSocketEndpoint: Configuration.WebSocketEndpoint = {
					type: "websocket",
					servers: endpointConfiguration.getString("servers").split(" "),
					bindPath: endpointConfiguration.getString("bindPath", "/"),
					defaultProtocol: "json-rpc"
				};
				return webSocketEndpoint;
			}
			default:
				throw new Error(`Non supported endpoint type: ${endpointType}`);
		}
	}

	export function parseServers(configuration: RawConfiguration): ReadonlyMap<
		HostingConfiguration.WebServer["name"],
		HostingConfiguration.WebServer
	> {
		const serverIndexes: ReadonlyArray<string> = configuration.getString("server_indexer").split(" ");
		const servers: Map<HostingConfiguration.WebServer["name"], HostingConfiguration.WebServer> = new Map();
		for (const serverName of serverIndexes) {
			const serverKey: string = `server.${serverName}`;
			const serverConfiguration: RawConfiguration = configuration.getNamespace(serverKey);
			servers.set(serverName, HostingConfiguration.parseWebServer(serverConfiguration, serverName));
		}
		return servers;
	}

	export function parseMessengers(configuration: RawConfiguration): ReadonlyMap<Messenger["name"], Messenger> {
		const messengerIndexes: ReadonlyArray<string> = configuration.getString("messenger_indexer").split(" ");
		const messengers: Map<Messenger["name"], Messenger> = new Map();
		for (const messengerIndex of messengerIndexes) {
			const messengerKey: string = `messenger.${messengerIndex}`;
			const messengerName: string = messengerIndex;
			const messengerConfiguration: RawConfiguration = configuration.getNamespace(messengerKey);
			const messengerType: Messenger["type"] = messengerConfiguration.getString("type") as Messenger["type"];
			switch (messengerType) {
				case "slack":
					throw new InvalidOperationError("Not implemented yet.");
				case "telegram": {
					const approvementTopicIndexers: ReadonlyArray<string> = messengerConfiguration.getString("approvementTopicBinding_indexer").split(" ");

					const approvementTopicBindings: Map<
						Messenger.Telegram.ApprovementTopicBinding["bindTopic"],
						Messenger.Telegram.ApprovementTopicBinding
					> = new Map();
					for (const approvementTopicIndexer of approvementTopicIndexers) {
						const approvementTopicBindingKey: string = `approvementTopicBinding.${approvementTopicIndexer}`;
						const bindingConfiguration: RawConfiguration = messengerConfiguration.getNamespace(approvementTopicBindingKey);
						const approvementTopicBinding: Messenger.Telegram.ApprovementTopicBinding = {
							bindTopic: bindingConfiguration.getString("bindTopic"),
							chatId: bindingConfiguration.getString("chatId"),
							approvers: bindingConfiguration.hasNonEmpty("approvers")
								? new Set(bindingConfiguration.getString("approvers").split(" "))
								: null,
							renderTemplate: bindingConfiguration.getString("renderTemplate")
						};
						if (approvementTopicBindings.has(approvementTopicBinding.bindTopic)) {
							throw new ConfigurationError(
								`Approvement Topic Binding name '${approvementTopicBinding.bindTopic}' duplication detected.`,
								approvementTopicBindingKey,
								null
							);
						}
						approvementTopicBindings.set(approvementTopicBinding.bindTopic, Object.freeze(approvementTopicBinding));
					}

					const telegram: Messenger.Telegram = {
						type: messengerType,
						name: messengerName,
						apiToken: messengerConfiguration.getString("apiToken"),
						approvementTopicBindings
					};
					messengers.set(messengerName, Object.freeze(telegram));
					break;
				}
				default:
					throw new Messenger.UnreachableMessengerType(messengerType);
			}
		}

		return messengers;
	}

	export function parseApprovementTopics(configuration: RawConfiguration): ReadonlyMap<ApprovementTopicName, ApprovementTopic> {
		const topicIndexes: ReadonlyArray<string> = configuration.getString("topic_indexer").split(" ");
		const topics: Map<ApprovementTopicName, ApprovementTopic> = new Map();
		for (const topicIndex of topicIndexes) {
			const topicKey: string = `topic.${topicIndex}`;
			const topicConfiguration: RawConfiguration = configuration.getNamespace(topicKey);
			const topicName: string = topicIndex;
			const topic: ApprovementTopic = {
				name: topicName,
				description: topicConfiguration.getString("description"),
				requireVotes: topicConfiguration.getInteger("requireVotes"),
				expireTimeout: topicConfiguration.getInteger("expireTimeout"),
				authType: topicConfiguration.hasNonEmpty("authType") ? topicConfiguration.getString("authType") : null,
				schema: topicConfiguration.hasNonEmpty("schema") ? topicConfiguration.getString("schema") : null
			};
			topics.set(topic.name, Object.freeze(topic));
		}
		return topics;
	}

	export function parseCors(configuration: RawConfiguration): Configuration.Cors {
		const methods: ReadonlyArray<string> = Object.freeze(configuration.getString("methods").split(" "));
		const whiteList: ReadonlyArray<string> = Object.freeze(configuration.getString("whiteList").split(" "));
		const allowedHeaders: ReadonlyArray<string> = Object.freeze(configuration.getString("allowedHeaders").split(" "));
		return Object.freeze({ methods, whiteList, allowedHeaders });
	}
}
