import { CancellationToken, EventChannel } from "@zxteam/contract";
import { EventChannelMixin } from "@zxteam/channels";
import { InvalidOperationError } from "@zxteam/errors";
import { Initable } from "@zxteam/disposable";
import { Logger } from "@zxteam/logger";
import { Configuration } from "../Configuration";

import { render } from "mustache";
import { ApprovementId, ApprovementTopicName } from "../model/Primitives";
import { Approvement } from "../model/Approvement";
import { KeyValueDb } from "../misc/KeyValueDb";
import { ApprovementTopic } from "../model/ApprovementTopic";
import { Approver } from "../model/Approver";

export abstract class Messenger extends Initable {
	protected readonly _approveEventChannel: ApprovementEventChannelSink;
	protected readonly _refuseEventChannel: ApprovementEventChannelSink;
	protected readonly _configuration: Messenger.Configuration;
	protected readonly _log: Logger;
	protected readonly _kvDb: KeyValueDb;

	public get approveEventChannel(): Messenger.ApprovementEventChannel { return this._approveEventChannel; }
	public get name(): string { return this.name; }
	public get refuseEventChannel(): Messenger.ApprovementEventChannel { return this._refuseEventChannel; }

	public isBoundToApprovementTopic(approvementTopicName: ApprovementTopicName): boolean {
		return this._configuration.approvementTopicBindings.has(approvementTopicName);
	}

	public abstract closeApprovementAsApprove(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	public abstract closeApprovementAsExpired(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId
	): Promise<void>;

	public abstract closeApprovementAsRefuse(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId,
		refuser: Approver
	): Promise<void>;

	public abstract registerApprovement(
		cancellationToken: CancellationToken,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId,
		renderData: any
	): Promise<Messenger.ApprovementMessageToken>;

	public abstract updateApprovement(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	protected constructor(configuration: Messenger.Configuration, kvDb: KeyValueDb, log: Logger) {
		super();
		this._configuration = configuration;
		this._kvDb = kvDb;
		this._log = log;
		this._approveEventChannel = new ApprovementEventChannelSink();
		this._refuseEventChannel = new ApprovementEventChannelSink();
	}

	protected static renderMessageContent(mustacheRenderTemplate: string, renderData: any): string {
		const mustacheDataContext = new Proxy(renderData, {
			get(__, property) {
				if (typeof property === "string") {
					if (property in renderData) {
						return renderData[property];
					}
					throw new InvalidOperationError(`Non-existing property '${property}'.`);
				}
			}
		});

		const messageContent: string = render(mustacheRenderTemplate, mustacheDataContext);
		return messageContent;
	}

}

export namespace Messenger {
	export type ApprovementMessageToken = string;

	// tslint:disable-next-line: no-shadowed-variable
	export interface Configuration extends Configuration.Messenger.Common {
		readonly approvementTopics: Map<ApprovementTopicName, ApprovementTopic>;
	}


	export interface ApprovementEvent extends EventChannel.Event<Approver> {
		readonly cancellationToken: CancellationToken;
		readonly sender: Messenger;
		readonly approvementId: ApprovementId;
	}
	export type ApprovementEventChannel = EventChannel<Approver, ApprovementEvent>;

}

class ApprovementEventChannelSink implements Messenger.ApprovementEventChannel {
	public async emit(
		cancellationToken: CancellationToken,
		sender: Messenger,
		approvementId: ApprovementId,
		data: Approver
	): Promise<void> {
		await this.notify(Object.freeze({ cancellationToken, sender, approvementId, data }));
	}
}
interface ApprovementEventChannelSink extends EventChannelMixin<Approver, Messenger.ApprovementEvent> { }
EventChannelMixin.applyMixin(ApprovementEventChannelSink);

