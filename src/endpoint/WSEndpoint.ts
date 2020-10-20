import { CancellationToken, Logger, SubscriberChannel } from "@zxteam/contract";
import { DUMMY_CANCELLATION_TOKEN } from "@zxteam/cancellation";
import { Disposable, Initable } from "@zxteam/disposable";
import { Ensure, ensureFactory } from "@zxteam/ensure";
import { InvalidOperationError, wrapErrorIfNeeded } from "@zxteam/errors";
import { Configuration as HostingConfiguration, WebServer, WebSocketChannelFactoryEndpoint } from "@zxteam/hosting";
import { Inject } from "@zxteam/launcher";

import * as WebSocket from "ws";
import { Service } from "../Service";

//import { fromBuffer, toBuffer } from "../util/ArrayBufferUtils";

const ensure: Ensure = ensureFactory();

export class WSEndpoint extends WebSocketChannelFactoryEndpoint {
	private readonly _service: Service;

	public constructor(
		servers: ReadonlyArray<WebServer>,
		opts: HostingConfiguration.WebSocketEndpoint,
		log: Logger,
		service: Service
	) {
		super(servers, opts, log);
		this._service = service;
	}

	public async createBinaryChannel(
		cancellationToken: CancellationToken, webSocket: WebSocket, subProtocol: string
	): Promise<WebSocketChannelFactoryEndpoint.BinaryChannel> {
		throw new InvalidOperationError("Not implemented yet");
	}
}

