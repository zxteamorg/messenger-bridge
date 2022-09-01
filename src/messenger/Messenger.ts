import { FCancellationToken, FEventChannel, FEventChannelMixin, FExceptionInvalidOperation, FExecutionContext, FInitableBase, FLogger } from "@freemework/common";

import { Configuration } from "../Configuration";

import { render } from "mustache";
import { ApprovementId, ApprovementTopicName } from "../model/Primitives";
import { Approvement } from "../model/Approvement";
import { KeyValueDb } from "../misc/KeyValueDb";
import { ApprovementTopic } from "../model/ApprovementTopic";
import { Approver } from "../model/Approver";

export abstract class Messenger extends FInitableBase {
	protected readonly _approveEventChannel: ApprovementEventChannelSink;
	protected readonly _refuseEventChannel: ApprovementEventChannelSink;
	protected readonly _configuration: Messenger.Configuration;
	protected readonly _kvDb: KeyValueDb;

	public get approveEventChannel(): Messenger.ApprovementEventChannel { return this._approveEventChannel; }
	public get name(): string { return this.name; }
	public get refuseEventChannel(): Messenger.ApprovementEventChannel { return this._refuseEventChannel; }

	public isBoundToApprovementTopic(approvementTopicName: ApprovementTopicName): boolean {
		return this._configuration.approvementTopicBindings.has(approvementTopicName);
	}

	public abstract closeApprovementAsApprove(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	public abstract closeApprovementAsExpired(
		executionContext: FExecutionContext,
		approvementId: ApprovementId
	): Promise<void>;

	public abstract closeApprovementAsRefuse(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		refuser: Approver
	): Promise<void>;

	public abstract registerApprovement(
		executionContext: FExecutionContext,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId,
		renderData: any
	): Promise<Messenger.ApprovementMessageToken>;

	public abstract updateApprovement(
		executionContext: FExecutionContext,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void>;

	protected constructor(configuration: Messenger.Configuration, kvDb: KeyValueDb) {
		super();
		this._configuration = configuration;
		this._kvDb = kvDb;
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
					throw new FExceptionInvalidOperation(`Non-existing property '${property}'.`);
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


	export interface ApprovementEvent extends FEventChannel.Event<Approver> {
		readonly sender: Messenger;
		readonly approvementId: ApprovementId;
	}
	export type ApprovementEventChannel = FEventChannel<Approver, ApprovementEvent>;

}

class ApprovementEventChannelSink implements Messenger.ApprovementEventChannel {
	public async emit(
		executionContext: FExecutionContext,
		sender: Messenger,
		approvementId: ApprovementId,
		data: Approver
	): Promise<void> {
		await this.notify(executionContext, Object.freeze({ sender, approvementId, data }));
	}
}
interface ApprovementEventChannelSink extends FEventChannelMixin<Approver, Messenger.ApprovementEvent> { }
FEventChannelMixin.applyMixin(ApprovementEventChannelSink);

