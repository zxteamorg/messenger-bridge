import { FCancellationToken, FEnsure, FExecutionContext, FExecutionContextCancellation, FExecutionContextLogger, FLogger } from "@freemework/common";
import { FAbstractWebServer, FHostingConfiguration, FWebServer } from "@freemework/hosting";

import * as express from "express";
import * as bodyParser from "body-parser";

// Endpoint
import { BaseEndpoint } from "./BaseEndpoint";
import { Service } from "../Service";
import { Bind } from "../misc/Bind";
import { Approvement } from "../model/Approvement";

const ensure: FEnsure = FEnsure.create();

const { name: packageName, version: packageVersion } = require("../../package.json");

export class RestEndpoint extends BaseEndpoint {
	private readonly _service: Service;

	public constructor(
		servers: ReadonlyArray<FWebServer>,
		opts: FHostingConfiguration.BindEndpoint,
		service: Service
	) {
		super(servers, opts);

		this._service = service;

		this._router.get("/approvement", super.safeBinder(this._getTopics));
		this._router.get("/approvement/:topic/:approvementId", super.safeBinder(this._getApprovement));
		this._router.post("/approvement/:topic", bodyParser.json(), super.safeBinder(this._createApprovement));
		this._router.get("/", (__, res) => res.send(JSON.stringify({ packageName, packageVersion }, null, "\t")));
	}

	@Bind
	private async _getTopics(req: express.Request, res: express.Response): Promise<void> {
		const topis = [...this._service.approvementTopics.values()];
		res.writeHead(200).end(JSON.stringify(topis, null, "\t"));
	}

	@Bind
	private async _createApprovement(req: express.Request, res: express.Response): Promise<void> {
		const cancellationToken: FCancellationToken = FAbstractWebServer.createFCancellationToken(req);

		const method: string = req.method.toUpperCase();

		let executionContext = FExecutionContext.None;
		executionContext = new FExecutionContextCancellation(executionContext, cancellationToken, true);
		executionContext = new FExecutionContextLogger(executionContext, this.constructor.name, {
			"httpMethod": method,
			"httpPath": req.originalUrl
		});

		const topicName: string = ensure.string(req.params.topic);
		const renderData: any = req.body;

		const approvement: Approvement = await this._service.createApprovement(executionContext, topicName, renderData);

		res.writeHead(200).end(JSON.stringify({
			approvementId: approvement.approvementId
		}, null, "\t"));
	}

	@Bind
	private async _getApprovement(req: express.Request, res: express.Response): Promise<void> {
		const cancellationToken: FCancellationToken = FAbstractWebServer.createFCancellationToken(req);

		const method: string = req.method.toUpperCase();

		let executionContext = FExecutionContext.None;
		executionContext = new FExecutionContextCancellation(executionContext, cancellationToken, true);
		executionContext = new FExecutionContextLogger(executionContext, this.constructor.name, {
			"httpMethod": method,
			"httpPath": req.originalUrl
		});

		const topicName: string = ensure.string(req.params.topic);
		const approvementId: string = ensure.string(req.params.approvementId);

		try {
			const approvement: Service.ApprovementWithStatus = await this._service
				.getApprovement(executionContext, topicName, approvementId);

			res.writeHead(200).end(JSON.stringify({
				approvementId: approvement.approvementId,
				topic: approvement.approvementTopic.name,
				requireVotes: approvement.approvementTopic.requireVotes,
				expireAt: approvement.expireAt.toISOString(),
				status: approvement.status,
				approvedBy: approvement.approvedBy,
				refuseBy: approvement.refuseBy
			}, null, "\t"));
		} catch (e) {
			if (e instanceof Service.NoSuchApprovement) {
				res.writeHead(404, e.message).end();
				return;
			}
			throw e;
		}
	}
}
