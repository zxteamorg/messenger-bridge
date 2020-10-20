import { CancellationToken, Logger } from "@zxteam/contract";
import { DUMMY_CANCELLATION_TOKEN, ManualCancellationTokenSource } from "@zxteam/cancellation";
import { Disposable, using } from "@zxteam/disposable";
import { ensureFactory, Ensure, EnsureError } from "@zxteam/ensure";
import { ArgumentError, CancelledError, InvalidOperationError, wrapErrorIfNeeded } from "@zxteam/errors";
import { WebClient } from "@zxteam/web-client";

import * as _ from "lodash";

import { Configuration } from "../Configuration";
import { Bind } from "../misc/Bind";
import { Messenger } from "./Messenger";
import { ApprovementId, ApprovementTopicName } from "../model/Primitives";
import { KeyValueDb } from "../misc/KeyValueDb";
import { ApprovementTopic } from "../model/ApprovementTopic";
import { Approver } from "../model/Approver";

const approvementMessageTokenEnsure: Ensure = ensureFactory((message, data) => {
	throw new TelegramMessenger.ApprovementMessageTokenError(message, data);
});
const protocolEnsure: Ensure = ensureFactory((message, data) => {
	throw new TelegramMessenger.TelegramProtocolError(message, data);
});

export class TelegramMessenger extends Messenger {
	private readonly _workerSleepMs: TelegramMessenger.Opts["workerSleepMs"];
	private readonly _telegram: TelegramApiClient;
	private readonly _disposeCancellationTokenSource: ManualCancellationTokenSource;
	private readonly _chatTopics: Map<
		TelegramApiClientInternal.ChatId,
		Configuration.Messenger.Common.ApprovementTopicBinding["bindTopic"]
	>;
	private _workerTimeout: NodeJS.Timeout | null;
	private _safeWorkerTask: Promise<void> | null;
	private _latestProcessedUpdateId: number | null;

	public constructor(
		opts: TelegramMessenger.Opts,
		configuration: TelegramMessenger.Configuration,
		kvDb: KeyValueDb, log: Logger
	) {
		if (opts.workerSleepMs < 240 || opts.workerSleepMs > 60000) {
			throw new ArgumentError(
				"opts.workerSleepMs",
				`Wrong workerSleepMs value: ${opts.workerSleepMs}. Expected a value in range [240..60000].`
			);
		}

		super(configuration, kvDb, log.getLogger(configuration.name));

		this._disposeCancellationTokenSource = new ManualCancellationTokenSource();
		this._workerSleepMs = opts.workerSleepMs;
		this._workerTimeout = null;
		this._safeWorkerTask = null;
		this._latestProcessedUpdateId = null;
		this._chatTopics = new Map();
		this._telegram = new TelegramApiClient({ telegramApiToken: opts.telegramApiToken });

		for (const approvementTopicBinding of configuration.approvementTopicBindings.values()) {
			this._chatTopics.set(approvementTopicBinding.chatId, approvementTopicBinding.bindTopic);
		}
	}

	public get name(): string { return this._configuration.name; }

	public async closeApprovementAsApprove(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void> {
		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._kvDb.get(
			cancellationToken,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new ArgumentError("approvementId",
				`Messenger '${this.name}' does not have related topic to approvementId: '${approvementId}'.`);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvementTopics.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new InvalidOperationError(
				`Wrong operation. Messenger '${this.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = await this._kvDb
			.get(cancellationToken, this.formatKey__messageContent_by_approvementId(approvementId));

		const approverNames: Array<string> = approvers
			.filter((approver: Approver): approver is Approver.Telegram => approver.source === "telegram")
			.map(approver => `@${approver.username}`);

		const approvedMessageContent: string = approverNames.length > 0
			? (
				messageContent.endsWith("\n")
					? `${messageContent}<i>Approved by: </i>${approverNames.join(" ")}`
					: `${messageContent}\n<i>Approved by: </i>${approverNames.join(" ")}`
			)
			: messageContent;

		await this._telegram.editMessageText(cancellationToken, {
			chat_id, message_id,
			text: approvedMessageContent,
			parse_mode: "HTML", disable_web_page_preview: true
		});
	}

	public async closeApprovementAsExpired(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId
	): Promise<void> {
		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._kvDb.get(
			cancellationToken,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new ArgumentError("approvementId",
				`Messenger '${this.name}' does not have related topic to approvementId: '${approvementId}'.`);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvementTopics.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new InvalidOperationError(
				`Wrong operation. Messenger '${this.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = await this._kvDb
			.get(cancellationToken, this.formatKey__messageContent_by_approvementId(approvementId));

		const expiredMessageContent: string = messageContent.endsWith("\n") ? `${messageContent}<i>Expired</i>` : `${messageContent}\n<i>Expired</i>`;

		await this._telegram.editMessageText(cancellationToken, {
			chat_id, message_id,
			text: expiredMessageContent,
			parse_mode: "HTML", disable_web_page_preview: true
		});
	}

	public async closeApprovementAsRefuse(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId,
		refuser: Approver
	): Promise<void> {
		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._kvDb.get(
			cancellationToken,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new ArgumentError("approvementId",
				`Messenger '${this.name}' does not have related topic to approvementId: '${approvementId}'.`);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvementTopics.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new InvalidOperationError(
				`Wrong operation. Messenger '${this.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = await this._kvDb
			.get(cancellationToken, this.formatKey__messageContent_by_approvementId(approvementId));

		const refusedMessageContent: string = refuser.source === "telegram"
			? (
				messageContent.endsWith("\n")
					? `${messageContent}<i>Refused by: </i>@${refuser.username}`
					: `${messageContent}\n<i>Refused by: </i>@${refuser.username}`
			)
			: messageContent;

		await this._telegram.editMessageText(cancellationToken, {
			chat_id, message_id,
			text: refusedMessageContent,
			parse_mode: "HTML", disable_web_page_preview: true
		});
	}

	public async registerApprovement(
		cancellationToken: CancellationToken,
		approvementTopicName: ApprovementTopicName,
		approvementId: ApprovementId,
		renderData: any
	): Promise<Messenger.ApprovementMessageToken> {
		this.verifyInitializedAndNotDisposed();

		const approvementTopicBinding: Configuration.Messenger.Telegram.ApprovementTopicBinding | undefined
			= this.configuration.approvementTopicBindings.get(approvementTopicName);

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvementTopics.get(approvementTopicName);

		if (approvementTopicBinding === undefined || approvementTopic === undefined) {
			throw new InvalidOperationError(
				`Wrong operation. Messenger '${this.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		const messageContent: string = Messenger.renderMessageContent(approvementTopicBinding.renderTemplate, renderData);

		await using(cancellationToken, () => this._kvDb.transaction(cancellationToken), async (__, db) => {
			const key: KeyValueDb.Key = this.formatKey__messageContent_by_approvementId(approvementId);
			const duplicateMessageContent: KeyValueDb.Value | null = await db.find(cancellationToken, key);
			if (duplicateMessageContent !== null) {
				throw new InvalidOperationError(`Duplicate approvementId: '${approvementId}'.`);
			}
			await db.set(cancellationToken, key, messageContent);
			await db.commit(cancellationToken);
		});

		const message: TelegramApiClientInternal.Message = await this._telegram.sendMessage(cancellationToken, {
			chat_id: approvementTopicBinding.chatId,
			text: messageContent,
			parse_mode: "HTML",
			disable_notification: true,
			disable_web_page_preview: true,
			reply_markup: {
				inline_keyboard: TelegramMessenger.formatInlineKeyboard(approvementTopic.requireVotes, 0)
			}
		});

		const approvementMessageToken: Messenger.ApprovementMessageToken = JSON.stringify({
			chat_id: approvementTopicBinding.chatId,
			message_id: message.message_id
		});

		await using(cancellationToken, () => this._kvDb.transaction(cancellationToken), async (__, db) => {
			await db.set(
				cancellationToken,
				this.formatKey__approvementMessageToken_by_approvementId(approvementId),
				approvementMessageToken
			);
			await db.set(
				cancellationToken,
				this.formatKey__approvementId_by_approvementMessageToken(approvementMessageToken),
				`${approvementId}`
			);
			await db.commit(cancellationToken);
		});

		return approvementMessageToken;
	}

	public async updateApprovement(
		cancellationToken: CancellationToken,
		approvementId: ApprovementId,
		approvers: ReadonlyArray<Approver>
	): Promise<void> {

		const approvementMessageToken: Messenger.ApprovementMessageToken = await this._kvDb.get(
			cancellationToken,
			this.formatKey__approvementMessageToken_by_approvementId(approvementId)
		);

		const approvementMessageTokenData = JSON.parse(approvementMessageToken);
		const chat_id: string = approvementMessageTokenEnsure.string(approvementMessageTokenData.chat_id);
		const message_id: number = approvementMessageTokenEnsure.number(approvementMessageTokenData.message_id);

		const approvementTopicName: ApprovementTopicName | undefined = this._chatTopics.get(chat_id);
		if (approvementTopicName === undefined) {
			throw new ArgumentError("approvementId",
				`Messenger '${this.name}' does not have related topic to approvementId: '${approvementId}'.`);
		}

		const approvementTopic: ApprovementTopic | undefined
			= this._configuration.approvementTopics.get(approvementTopicName);

		if (approvementTopic === undefined) {
			throw new InvalidOperationError(
				`Wrong operation. Messenger '${this.name}' does not have binding to the approvement topic '${approvementTopicName}'.`
			);
		}

		await this._telegram.editMessageReplyMarkup(cancellationToken, {
			chat_id, message_id,
			reply_markup: {
				inline_keyboard: TelegramMessenger.formatInlineKeyboard(approvementTopic.requireVotes, approvers.length)
			}
		});
	}

	protected async onInit(cancellationToken: CancellationToken): Promise<void> {
		this._log.debug("Initializing...");
		this._workerTimeout = setTimeout(this._backgroundWorker, this._workerSleepMs);
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

		this._log.debug("Disposed");
	}

	private get configuration(): TelegramMessenger.Configuration {
		return this._configuration as TelegramMessenger.Configuration;
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
		const opts = this._latestProcessedUpdateId !== null
			? {
				offset: this._latestProcessedUpdateId + 1
			}
			: {
				//
			};

		const updatesData = await this._telegram.getUpdates(this._disposeCancellationTokenSource.token, opts);

		for (const update of updatesData) {
			try {
				if (update.message !== undefined) {
					console.log(update.message);
				} else if (update.callback_query !== undefined) {
					await this._onUpdateCallbackQuery(DUMMY_CANCELLATION_TOKEN, update.callback_query);
				} else {
					this._log.debug(`Skip unsupported update: ${JSON.stringify(update)}`);
				}
			} catch (e) {
				this._log.warn(e);
			}

			this._latestProcessedUpdateId = this._latestProcessedUpdateId !== null
				? Math.max(this._latestProcessedUpdateId, update.update_id)
				: this._latestProcessedUpdateId = update.update_id;
		}

		if (this._log.isInfoEnabled) {
			this._log.info(`${updatesData.length} updates processed`);
		}
	}

	private async _onUpdateCallbackQuery(cancellationToken: CancellationToken, data: TelegramApiClientInternal.CallbackQuery): Promise<void> {

		const answerData: string = (data as any).data;
		const chat_id: string = (data as any).message.chat.id.toString();
		const chat_title: string = (data as any).message.chat.title.toString();
		const chat_type: string = (data as any).message.chat.type.toString();
		const message_id: number = (data as any).message.message_id;
		const message_date_unix: number = (data as any).message.date;
		const username: string = (data as any).from.username;

		const topicName = this._chatTopics.get(chat_id);
		if (topicName === undefined) {
			if (this._log.isDebugEnabled) {
				this._log.debug(
					`Skip CallbackQuery update due related topic was not found by chat_id: ${chat_id}`
				);
			}
			return;
		}
		const bindingConfiguration = this._configuration.approvementTopicBindings.get(topicName);
		if (bindingConfiguration === undefined) {
			if (this._log.isDebugEnabled) {
				this._log.debug(
					`Skip CallbackQuery update due related bindingConfiguration was not found by topicName: ${topicName}`
				);
			}
			return;
		}

		const approvementMessageToken: Messenger.ApprovementMessageToken = JSON.stringify({
			chat_id: chat_id,
			message_id: message_id
		});

		const approvementId: ApprovementId | null = await this._kvDb
			.find(cancellationToken, this.formatKey__approvementId_by_approvementMessageToken(approvementMessageToken));
		if (approvementId === null) {
			if (this._log.isDebugEnabled) {
				this._log.debug(
					`Skip CallbackQuery update due related approvementId was not found by chat_id: ${chat_id} and message_id: ${message_id}`
				);
			}
			return;
		}

		const approver: Approver = Object.freeze(
			new TelegramMessengerInternal.ApproverImpl(
				username, chat_id, chat_title, chat_type, message_id, new Date(message_date_unix * 1000)
			)
		);
		if (answerData === TelegramApiClientInternal.ApprovementVote.APPROVE) {
			await this._approveEventChannel.emit(cancellationToken, this, approvementId, approver);
		} else if (answerData === TelegramApiClientInternal.ApprovementVote.REFUSE) {
			await this._refuseEventChannel.emit(cancellationToken, this, approvementId, approver);
		} else {
			throw new InvalidOperationError(`Unexpected answer data '${answerData}'.`);
		}
	}

	private static formatInlineKeyboard(requireVotes: number, approvedVotes: number) {
		if (requireVotes < 0) { throw new ArgumentError("requireVotes", "Value should be positive of zero."); }
		if (approvedVotes < 0) { throw new ArgumentError("approvedVotes", "Value should be positive of zero."); }
		return Object.freeze([
			Object.freeze([
				Object.freeze({
					text: `Approve (${approvedVotes}/${requireVotes})`,
					callback_data: TelegramApiClientInternal.ApprovementVote.APPROVE
				}),
				Object.freeze({
					text: "Refuse",
					callback_data: TelegramApiClientInternal.ApprovementVote.REFUSE
				})
			])
		]);
	}

	private formatKey__messageContent_by_approvementId(approvementId: ApprovementId) {
		return `${this.name}:messageContent_by_approvementId(${approvementId})`;
	}

	private formatKey__approvementMessageToken_by_approvementId(approvementId: ApprovementId) {
		return `${this.name}:approvementMessageToken_by_approvementId(${approvementId})`;
	}

	private formatKey__approvementId_by_approvementMessageToken(approvementMessageToken: Messenger.ApprovementMessageToken) {
		return `${this.name}:approvementId_by_approvementMessageToken(${approvementMessageToken})`;
	}
}

export namespace TelegramMessenger {
	export interface Opts extends TelegramApiClient.Opts {
		readonly workerSleepMs: number;
	}

	// tslint:disable-next-line: no-shadowed-variable
	export interface Configuration extends Configuration.Messenger.Telegram {
		readonly approvementTopics: Map<ApprovementTopicName, ApprovementTopic>;
	}

	export class ApprovementMessageTokenError extends EnsureError { }
	export class TelegramProtocolError extends EnsureError { }
}

namespace TelegramMessengerInternal {
	export class ApproverImpl implements Approver.Telegram {
		public readonly source: "telegram" = "telegram";

		public constructor(
			public readonly username: string,
			public readonly chat_id: string,
			public readonly chat_title: string,
			public readonly chat_type: string,
			public readonly message_id: number,
			public readonly createdAt: Date
		) { }

		public equalTo(other: Approver): boolean {
			return this.source === other.source
				&& this.username === other.username
				&& this.chat_id === other.chat_id
				&& this.chat_title === other.chat_title
				&& this.message_id === other.message_id
				&& this.createdAt.getTime() === other.createdAt.getTime()
				;
		}

		public toString(): string {
			return `${this.source}/${this.username}`;
		}
	}
}

/**
 * API client for https://core.telegram.org/bots/api
 */
class TelegramApiClient extends Disposable {
	private readonly _webClient: TelegramApiClientInternal.TelegramWebClient;

	public constructor(opts: TelegramApiClient.Opts) {
		const apiUrl: URL = new URL("https://api.telegram.org/");
		apiUrl.pathname = `bot${opts.telegramApiToken}/`;

		super();

		//
		// https://core.telegram.org/bots/api#making-requests
		// All queries to the Telegram Bot API must be served over HTTPS and need
		// to be presented in this form: https://api.telegram.org/bot<token>/METHOD_NAME
		this._webClient = new TelegramApiClientInternal.TelegramWebClient(apiUrl, { httpClient: { timeout: 30000 } });
	}

	/**
	 * https://core.telegram.org/bots/api#editmessagereplymarkup
	 */
	public async editMessageReplyMarkup(cancellationToken: CancellationToken, data: {
		readonly chat_id?: string;
		readonly message_id?: number;
		readonly inline_message_id?: string;
		readonly reply_markup?: TelegramApiClientInternal.InlineKeyboardMarkup; //| TelegramApiClientInternal.ReplyKeyboardMarkup
		//| TelegramApiClientInternal.ReplyKeyboardRemove | TelegramApiClientInternal.ForceReply
	}) {
		try {
			const response: WebClient.Response = await this._webClient
				.postJson(cancellationToken, "editMessageReplyMarkup", data);
			return response.bodyAsJson;
		} catch (e) {
			console.error(e.body.toString());
			throw e;
		}
	}

	public async editMessageText(cancellationToken: CancellationToken, data: {
		/**
		 * Required if inline_message_id is not specified. Unique identifier for the target chat
		 * or username of the target channel (in the format @channelusername)
		 */
		readonly chat_id?: string;
		/**
		 * Required if inline_message_id is not specified. Identifier of the message to edit
		 */
		readonly message_id?: number;
		/**
		 * Required if chat_id and message_id are not specified. Identifier of the inline message
		 */
		readonly inline_message_id?: string;
		/**
		 * Text of the message to be sent, 1-4096 characters after entities parsing.
		 */
		readonly text: string;
		/**
		 * Mode for parsing entities in the message text. See formatting options for more details.
		 */
		readonly parse_mode?: "HTML" | "MarkdownV2",
		/**
		 * Disables link previews for links in this message
		 */
		readonly disable_web_page_preview?: boolean;
		/**
		 * Additional interface options. A JSON-serialized object for an inline keyboard, custom reply keyboard,
		 * instructions to remove reply keyboard or to force a reply from the user.
		 */
		readonly reply_markup?: TelegramApiClientInternal.InlineKeyboardMarkup //| TelegramApiClientInternal.ReplyKeyboardMarkup
		//| TelegramApiClientInternal.ReplyKeyboardRemove | TelegramApiClientInternal.ForceReply
	}) {
		try {
			const response: WebClient.Response = await this._webClient.postJson(cancellationToken, "editMessageText", data);
			return response.bodyAsJson.result;
		} catch (e) {
			console.error(e.body.toString());
			throw e;
		}
	}

	public async getMe(cancellationToken: CancellationToken): Promise<any> {
		const response: WebClient.Response = await this._webClient.get(cancellationToken, "getMe");
		return response.bodyAsJson;
	}

	/**
	 * https://core.telegram.org/bots/api#getupdates
	 */
	public async getUpdates(cancellationToken: CancellationToken, data?: {
		/**
		 * Identifier of the first update to be returned. Must be greater by one than the highest
		 * among the identifiers of previously received updates.
		 * By default, updates starting with the earliest unconfirmed update are returned.
		 * An update is considered confirmed as soon as getUpdates is called with an offset higher than its update_id.
		 * The negative offset can be specified to retrieve updates starting from -offset update from
		 * the end of the updates queue. All previous updates will forgotten.
		 */
		readonly offset?: number;

		/**
		 * Limits the number of updates to be retrieved. Values between 1-100 are accepted. Defaults to 100.
		 */
		readonly limit?: number;

		/**
		 * Timeout in seconds for long polling. Defaults to 0, i.e. usual short polling. Should be positive,
		 * short polling should be used for testing purposes only.
		 */
		readonly timeout?: number;

		/**
		 * A JSON-serialized list of the update types you want your bot to receive.
		 * For example, specify [“message”, “edited_channel_post”, “callback_query”]
		 * to only receive updates of these types. See Update for a complete list of
		 * available update types. Specify an empty list to receive all updates regardless
		 * of type (default). If not specified, the previous setting will be used.
		 */
		readonly allowed_updates?: ReadonlyArray<string>;
	}): Promise<Array<TelegramApiClientInternal.Update>> {

		const queryArgs: { [key: string]: string; } = {
			timeout: data !== undefined && data.timeout !== undefined ? data.timeout.toString() : "16"
		};

		if (data !== undefined) {
			if (data.offset !== undefined) {
				queryArgs.offset = data.offset.toString();
			}
		}

		const response: WebClient.Response = await this._webClient.get(cancellationToken, "getUpdates", {
			queryArgs
		});

		const rawResult = protocolEnsure.array(response.bodyAsJson.result);

		const result: Array<TelegramApiClientInternal.Update> = rawResult.map(rawUpdate => {
			const update_id: number = protocolEnsure.integer(rawUpdate.update_id);

			if ("message" in rawUpdate) {
				// TODO Validate message
				return Object.freeze({
					update_id,
					message: rawUpdate.message
				});
			}

			if ("callback_query" in rawUpdate) {
				// TODO Validate callback_query
				return Object.freeze({
					update_id,
					callback_query: rawUpdate.callback_query
				});
			}

			return Object.freeze({ update_id });
		});

		return result;
	}

	public async sendMessage(cancellationToken: CancellationToken, data: {
		/**
		 * 	Unique identifier for the target chat or username of the target channel (in the format @channelusername).
		 */
		readonly chat_id: string;
		/**
		 * Text of the message to be sent, 1-4096 characters after entities parsing.
		 */
		readonly text: string;
		/**
		 * Mode for parsing entities in the message text. See formatting options for more details.
		 */
		readonly parse_mode?: "HTML" | "MarkdownV2",
		/**
		 * Disables link previews for links in this message
		 */
		readonly disable_web_page_preview?: boolean;
		/**
		 * Sends the message silently. Users will receive a notification with no sound.
		 */
		readonly disable_notification?: boolean;
		/**
		 * If the message is a reply, ID of the original message.
		 */
		readonly reply_to_message_id?: number;
		/**
		 * Additional interface options. A JSON-serialized object for an inline keyboard, custom reply keyboard,
		 * instructions to remove reply keyboard or to force a reply from the user.
		 */
		readonly reply_markup: TelegramApiClientInternal.InlineKeyboardMarkup //| TelegramApiClientInternal.ReplyKeyboardMarkup
		//| TelegramApiClientInternal.ReplyKeyboardRemove | TelegramApiClientInternal.ForceReply
	}): Promise<TelegramApiClientInternal.Message> {
		try {
			const response: WebClient.Response = await this._webClient.postJson(cancellationToken, "sendMessage", data);
			return response.bodyAsJson.result;
		} catch (e) {
			console.error(e.body.toString());
			throw e;
		}
	}

	protected async onDispose(): Promise<void> {
		await this._webClient.dispose();
	}
}

export namespace TelegramApiClient {
	export interface Opts {
		/**
		 * https://core.telegram.org/bots#6-botfather
		 */
		readonly telegramApiToken: string;
	}
}

namespace TelegramApiClientInternal {
	export class TelegramWebClient extends WebClient {
		public postJson(cancellationToken: CancellationToken, urlPath: string, data: any): Promise<WebClient.Response> {
			return super.invoke(cancellationToken, urlPath, "POST", {
				headers: {
					"Content-Type": "application/json"
				},
				body: Buffer.from(JSON.stringify(data))
			});
		}
	}

	export const enum ApprovementVote {
		APPROVE = "Y",
		REFUSE = "N"
	}

	export type ChatId = string;
	export type MessageId = number;

	/**
	 * https://core.telegram.org/bots/api#callbackquery
	 */
	export interface CallbackQuery {
		//
	}

	/**
	 * https://core.telegram.org/bots/api#inlinekeyboardbutton
	 */
	export interface InlineKeyboardButton {
		readonly text: string;
		readonly url?: URL;
		readonly callback_data?: string;
	}

	/**
	 * https://core.telegram.org/bots/api#inlinekeyboardmarkup
	 */
	export interface InlineKeyboardMarkup {
		readonly inline_keyboard: ReadonlyArray<ReadonlyArray<InlineKeyboardButton>>;
	}

	/**
	 * https://core.telegram.org/bots/api#message
	 */
	export interface Message {
		/**
		 * Unique message identifier inside this chat
		 */
		readonly message_id: MessageId;
	}

	/**
	 * https://core.telegram.org/bots/api#update
	 */
	export interface Update {
		/**
		 * The update's unique identifier. Update identifiers start from a certain positive number and increase sequentially.
		 * This ID becomes especially handy if you're using Webhooks, since it allows you to ignore repeated updates
		 * or to restore the correct update sequence, should they get out of order. If there are no new updates for at least a week,
		 * then identifier of the next update will be chosen randomly instead of sequentially.
		 */
		readonly update_id: number;

		// New incoming message of any kind — text, photo, sticker, etc.
		readonly message?: Message;

		// edited_message	Message	Optional. New version of a message that is known to the bot and was edited
		// channel_post	Message	Optional. New incoming channel post of any kind — text, photo, sticker, etc.
		// edited_channel_post	Message	Optional. New version of a channel post that is known to the bot and was edited
		// inline_query	InlineQuery	Optional. New incoming inline query

		// chosen_inline_result	ChosenInlineResult	Optional. The result of an inline query that was chosen by a user
		//and sent to their chat partner. Please see our documentation on the feedback collecting for details on how
		//to enable these updates for your bot.

		/**
		 * New incoming callback query
		 */
		readonly callback_query?: CallbackQuery;

		// shipping_query	ShippingQuery	Optional. New incoming shipping query. Only for invoices with flexible price
		// pre_checkout_query	PreCheckoutQuery	Optional. New incoming pre-checkout query. Contains full information about checkout
		// poll	Poll	Optional. New poll state. Bots receive only updates about stopped polls and polls, which are sent by the bot
		// poll_answer	PollAnswer	Optional. A user changed their answer in a non-anonymous poll. Bots receive new votes only
		//in polls that were sent by the bot itself.
	}
}
