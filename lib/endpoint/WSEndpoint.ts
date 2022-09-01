import { FEnsure, FExceptionInvalidOperation, FExecutionContext } from "@freemework/common";
import { FHostingConfiguration, FWebServer, FWebSocketChannelFactoryEndpoint } from "@freemework/hosting";

import * as WebSocket from "ws";
import { Service } from "../Service";

//import { fromBuffer, toBuffer } from "../util/ArrayBufferUtils";

const ensure: FEnsure = FEnsure.create();

export class WSEndpoint extends FWebSocketChannelFactoryEndpoint {
	private readonly _service: Service;

	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: FHostingConfiguration.WebSocketEndpoint,
		service: Service
	) {
		super(servers, opts);
		this._service = service;
	}

	public async createBinaryChannel(
		executionContext: FExecutionContext, webSocket: WebSocket, subProtocol: string
	): Promise<FWebSocketChannelFactoryEndpoint.BinaryChannel> {
		throw new FExceptionInvalidOperation("Not implemented yet");
	}
}

