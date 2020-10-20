import { CancellationToken, Logger } from "@zxteam/contract";
import { Disposable, Initable } from "@zxteam/disposable";
import { ArgumentError, CancelledError, InvalidOperationError, wrapErrorIfNeeded } from "@zxteam/errors";

import * as _ from "lodash";
import { v4 as uuid } from "uuid";

import { Configuration } from "./Configuration";
import { Messenger } from "./messenger/Messenger";
import { TelegramMessenger } from "./messenger/TelegramMessenger";
import { ApprovementId, ApprovementTopicName } from "./model/Primitives";
import { Approvement } from "./model/Approvement";
import { ApprovementTopic } from "./model/ApprovementTopic";
import { KeyValueDb, InMemory } from "./misc/KeyValueDb";
import { Bind } from "./misc/Bind";
import { Approver } from "./model/Approver";
import { ManualCancellationTokenSource } from "@zxteam/cancellation";

export class Service extends Initable {
	private readonly _workerSleepMs: number;
	private readonly _log: Logger;
	private readonly _configuration: Configuration;
	private readonly _kbDb: KeyValueDb;
	private readonly _approvementTopics: Map<ApprovementTopicName, ApprovementTopic>;
	private readonly _messengers: ReadonlyMap<Configuration.Messenger["name"], Messenger>;
	private readonly _activeApprovements: Map<ApprovementId, ServiceInternal.ApprovementBundle>;
	private readonly _completedApprovements: Map<ApprovementId, ServiceInternal.ApprovementBundle>;
	private readonly _expiredApprovements: Map<ApprovementId, ServiceInternal.ApprovementBundle>;
	private readonly _disposeCancellationTokenSource: ManualCancellationTokenSource;
	private _workerTimeout: NodeJS.Timeout | null;
	private _safeWorkerTask: Promise<void> | null;

	public constructor(configuration: Configuration, log: Logger) {
		super();
		this._log = log;
		this._configuration = configuration;
		this._disposeCancellationTokenSource = new ManualCancellationTokenSource();
		this._workerSleepMs = 5000;
		this._workerTimeout = null;
		this._safeWorkerTask = null;

		this._kbDb = new InMemory();

		const messengers: Map<Configuration.Messenger["name"], Messenger> = new Map();

		this._approvementTopics = new Map();
		for (const [topicName, topicConfiguration] of configuration.approvement.topics) {
			this._approvementTopics.set(topicName, topicConfiguration);
		}

		for (const [messengerName, messengerConfiguration] of configuration.messengers) {
			switch (messengerConfiguration.type) {
				case "slack":
					throw new InvalidOperationError("Not implemented yet");
				case "telegram": {
					const messenger = new TelegramMessenger(
						{
							workerSleepMs: 250,
							telegramApiToken: messengerConfiguration.apiToken
						},
						{
							...messengerConfiguration,
							approvementTopics: this._approvementTopics
						},
						this._kbDb,
						log.getLogger(TelegramMessenger.name)
					);

					// Check for existing approvement topics, avoid misconfiguration
					for (const approvementTopicBinding of messengerConfiguration.approvementTopicBindings.values()) {
						const approvementTopic: ApprovementTopic | undefined
							= this._approvementTopics.get(approvementTopicBinding.bindTopic);
						if (approvementTopic === undefined) {
							throw new InvalidOperationError(
								`Wrong binding approvement topic name '${approvementTopicBinding.bindTopic}' on messenger '${messengerName}'. The topic does not exist.`
							);
						}
					}

					messenger.approveEventChannel.addHandler(this._onApprove);
					messenger.refuseEventChannel.addHandler(this._onRefuse);

					messengers.set(messengerName, messenger);
					break;
				}
				default:
					throw new Configuration.Messenger.UnreachableMessengerType(messengerConfiguration);

			}
		}

		this._messengers = messengers;
		this._activeApprovements = new Map();
		this._expiredApprovements = new Map();
		this._completedApprovements = new Map();
	}

	public get approvementTopics(): ReadonlyMap<ApprovementTopicName, ApprovementTopic> {
		return this._approvementTopics;
	}

	public async createApprovement(
		cancellationToken: CancellationToken, approvementTopicName: string, renderData: any
	): Promise<Approvement> {

		const approvementTopic: ApprovementTopic | undefined = this._approvementTopics.get(approvementTopicName);
		if (approvementTopic === undefined) {
			throw new ArgumentError("approvementTopicName", `No approvement topic '${approvementTopicName}'.`);
		}

		const approvementId: ApprovementId = uuid();
		const expireAt: Date = new Date(Date.now() + approvementTopic.expireTimeout * 1000);

		const approvementMessageTokens: Array<Messenger.ApprovementMessageToken> = [];
		for (const messenger of this._messengers.values()) {
			if (messenger.isBoundToApprovementTopic(approvementTopicName)) {
				const approvementMessageToken: Messenger.ApprovementMessageToken = await messenger.registerApprovement(
					cancellationToken, approvementTopicName, approvementId, renderData
				);
				approvementMessageTokens.push(approvementMessageToken);
			}
		}

		const approvement: Approvement = {
			approvementId,
			approvementTopic,
			//status: "PENDING",
			expireAt,
			approvedBy: Object.freeze([]),
			refuseBy: null
		};

		this._activeApprovements.set(approvementId, Object.freeze({
			approvement,
			messageTokens: approvementMessageTokens
		}));

		return approvement;
	}

	public async getApprovement(
		cancellationToken: CancellationToken,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId
	): Promise<Approvement & {
		readonly status: "PENDING" | "APPROVED" | "REFUSED" | "EXPIRED";
	}> {
		{ // scope
			const activeApprovementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
			if (activeApprovementBundle !== undefined) {
				if (activeApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new Service.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...activeApprovementBundle.approvement,
					status: "PENDING"
				});
			}
		}

		{ // scope
			const expiredApprovementBundle: ServiceInternal.ApprovementBundle | undefined = this._expiredApprovements.get(approvementId);
			if (expiredApprovementBundle !== undefined) {
				if (expiredApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new Service.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...expiredApprovementBundle.approvement,
					status: "EXPIRED"
				});
			}
		}

		{ // scope
			const completedApprovementBundle: ServiceInternal.ApprovementBundle | undefined = this._completedApprovements.get(approvementId);
			if (completedApprovementBundle !== undefined) {
				if (completedApprovementBundle.approvement.approvementTopic.name !== approvementTopicName) {
					throw new Service.NoSuchApprovement(approvementId);
				}

				return Object.freeze({
					...completedApprovementBundle.approvement,
					status: completedApprovementBundle.approvement.refuseBy !== null ? "REFUSED" : "APPROVED"
				});
			}
		}

		throw new Service.NoSuchApprovement(approvementId);
	}

	protected async onInit(cancellationToken: CancellationToken): Promise<void> {
		this._log.debug("Initializing...");
		await Initable.initAll(cancellationToken, ...this._messengers.values());
		try {
			this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
		} catch (e) {
			await Disposable.disposeAll(...this._messengers.values());
			throw e;
		}
		this._log.debug("Initialized.");
	}

	protected async onDispose(): Promise<void> {
		this._log.debug("Disposing...");

		if (this._workerTimeout !== null) {
			clearTimeout(this._workerTimeout);
			this._workerTimeout = null;
		}

		this._disposeCancellationTokenSource.cancel();

		if (this._safeWorkerTask !== null) {
			await this._safeWorkerTask;
		}

		for (const messenger of this._messengers.values()) {
			messenger.approveEventChannel.removeHandler(this._onApprove);
			messenger.refuseEventChannel.removeHandler(this._onRefuse);
		}
		await Disposable.disposeAll(...this._messengers.values());

		this._log.debug("Disposed");
	}

	@Bind
	private async _onApprove(event: Messenger.ApprovementEvent) {
		const approvementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(event.approvementId);
		if (approvementBundle === undefined) {
			if (this._log.isInfoEnabled) {
				this._log.warn(`Unexpected approve event. Approvement with id '${event.approvementId}' does not register.`);
			}
			return;
		}

		const existentApprover: Approver | undefined = approvementBundle.approvement.approvedBy
			.find(w => w.equalTo(event.data));

		if (
			(existentApprover !== undefined)
			|| approvementBundle.approvement.refuseBy !== null && approvementBundle.approvement.refuseBy.equalTo(event.data)
		) {
			if (this._log.isDebugEnabled) {
				this._log.debug(`Clickable user detected. Data: '${event.data.toString()}'`);
			}
			return;
		}

		if (
			approvementBundle.approvement.approvedBy.length === approvementBundle.approvement.approvementTopic.requireVotes
			|| approvementBundle.approvement.refuseBy !== null
		) {
			if (this._log.isDebugEnabled) {
				this._log.debug(`Approvement '${event.approvementId}' already completed.`);
			}
			return;
		}

		const updatedApprovementBundle: ServiceInternal.ApprovementBundle = Object.freeze({
			approvement: Object.freeze({
				...approvementBundle.approvement,
				approvedBy: Object.freeze([...new Set(approvementBundle.approvement.approvedBy), event.data])
			}),
			messageTokens: approvementBundle.messageTokens
		});


		if (updatedApprovementBundle.approvement.approvedBy.length < updatedApprovementBundle.approvement.approvementTopic.requireVotes) {
			// Update approvement

			this._activeApprovements.set(event.approvementId, updatedApprovementBundle);

			for (const messenger of this._messengers.values()) {
				if (messenger.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
					await messenger.updateApprovement(
						event.cancellationToken,
						event.approvementId,
						updatedApprovementBundle.approvement.approvedBy
					);
				}
			}
		} else {
			// Finalize approvement

			this._activeApprovements.delete(event.approvementId);
			this._completedApprovements.set(event.approvementId, updatedApprovementBundle);

			for (const messenger of this._messengers.values()) {
				if (messenger.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
					await messenger.closeApprovementAsApprove(
						event.cancellationToken,
						event.approvementId,
						updatedApprovementBundle.approvement.approvedBy
					);
				}
			}
		}
	}

	@Bind
	private async _onRefuse(event: Messenger.ApprovementEvent) {
		const approvementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(event.approvementId);
		if (approvementBundle === undefined) {
			if (this._log.isInfoEnabled) {
				this._log.warn(`Unexpected approve event. Approvement with id '${event.approvementId}' does not register.`);
			}
			return;
		}

		const existentApprover: Approver | undefined = approvementBundle.approvement.approvedBy
			.find(w => w.equalTo(event.data));

		if (
			(existentApprover !== undefined)
			|| approvementBundle.approvement.refuseBy !== null && approvementBundle.approvement.refuseBy.equalTo(event.data)
		) {
			if (this._log.isDebugEnabled) {
				this._log.debug(`Clickable user detected. Data: '${event.data.toString()}'`);
			}
			return;
		}

		if (
			approvementBundle.approvement.approvedBy.length === approvementBundle.approvement.approvementTopic.requireVotes
			|| approvementBundle.approvement.refuseBy !== null
		) {
			if (this._log.isDebugEnabled) {
				this._log.debug(`Approvement '${event.approvementId}' already completed.`);
			}
			return;
		}

		const updatedApprovementBundle: ServiceInternal.ApprovementBundle = Object.freeze({
			approvement: Object.freeze({
				...approvementBundle.approvement,
				refuseBy: event.data
			}),
			messageTokens: approvementBundle.messageTokens
		});

		this._activeApprovements.delete(event.approvementId);
		this._completedApprovements.set(event.approvementId, updatedApprovementBundle);

		for (const messenger of this._messengers.values()) {
			if (messenger.isBoundToApprovementTopic(updatedApprovementBundle.approvement.approvementTopic.name)) {
				await messenger.closeApprovementAsRefuse(
					event.cancellationToken,
					event.approvementId,
					event.data
				);
			}
		}
	}

	@Bind
	private _backgroundWorker(): void {
		if (this.disposing || this.disposed) { return; }

		if (this._safeWorkerTask) {
			this._log.error("[BUG] Illegal operation at current state. Previous worker is not completed yet.");
			return;
		}

		this._safeWorkerTask = this._backgroundWorkerJob()
			.catch(reason => {
				if (reason instanceof CancelledError) {
					this._log.debug("Worker job was cancelled.");
					return;
				}

				const err = wrapErrorIfNeeded(reason);
				if (this._log.isInfoEnabled) { this._log.info(`Worker job failure. Error: ${err.message}`); }
				this._log.trace(`Worker job failure.`, err);
			})
			.finally(() => {
				this._safeWorkerTask = null;
				this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
			});
	}

	private async _backgroundWorkerJob(): Promise<void> {
		// Check for expired Approvement
		const expiredApprovements: Array<ApprovementId> = [];
		const nowTimestamp: number = Date.now();
		for (const [approvementId, approvementBundle] of this._activeApprovements) {
			if (approvementBundle.approvement.expireAt.getTime() < nowTimestamp) {
				expiredApprovements.push(approvementId);
			}
		}

		if (expiredApprovements.length > 0) {
			for (const approvementId of expiredApprovements) {
				const approvementBundle: ServiceInternal.ApprovementBundle | undefined = this._activeApprovements.get(approvementId);
				if (approvementBundle === undefined) {
					this._log.error("[BUG] Illegal operation at current state. ApprovementBundle marked for expire, but not presents inside approvements dictionary.");
					continue;
				}
				this._activeApprovements.delete(approvementId);
				this._expiredApprovements.set(approvementId, approvementBundle);

				for (const messenger of this._messengers.values()) {
					if (messenger.isBoundToApprovementTopic(approvementBundle.approvement.approvementTopic.name)) {
						await messenger.closeApprovementAsExpired(
							this._disposeCancellationTokenSource.token,
							approvementId
						);
					}
				}
			}
		}
	}
}

export namespace Service {
	export type ApprovementWithStatus = Approvement & {
		readonly status: "PENDING" | "APPROVED" | "REFUSED" | "EXPIRED";
	};

	export class ServiceError extends Error {
		public get name(): string {
			return this.constructor.name;
		}
	}
	export class NoSuchApprovement extends ServiceError {
		public constructor(public readonly approvementId: ApprovementId) {
			super(`No such approvement '${approvementId}'`);
		}
	}
}

namespace ServiceInternal {
	export interface ApprovementBundle {
		readonly approvement: Approvement;
		readonly messageTokens: Array<Messenger.ApprovementMessageToken>;
	}
}
