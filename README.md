# MESSENGER BRIDGE

**MESSENGER BRIDGE** is a helper service with unified API for easy integration with messenger networks like Telegram, Slack, etc...

## Roadmap
* Approvement API allows to execute collective responsibility actions by make voting poll in a chat.
	* [x] Minimum viable product
	* [ ] `Approvement Topic` authorization
	* [ ] Data validation by JSON-Schema on Approvement creation
	* [ ] Configure `Approvement Topic` via chat commands
	* [ ] Demo usage via WebSocket on Welcome Page
* [ ] Commander API allows to call external HTTP API via commands in a chat.
* [ ] Notification API allows to map HTTP callbacks to messages in a chat.

## Quick Start

Run **MESSENGER BRIDGE** inside Docker and use it in few seconds.

```bash
docker run --rm --interactive --tty --env TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11 zxteamorg/messenger-bridge
```

Pass your Telegram bot's token into TELEGRAM_BOT_TOKEN environment variable and start to talk with your bot `/start @your_telegram_bot`.

## Real examples

### Approvement

![Big View Diagram](doc/asset/approve-me-big-view.png)

* [Production deployment approvement](TBD)
* [Grant permission approvement](TBD)
* [Payment approvement](TBD)

### Commander
* [Start production deployment](TBD)
* [Create JIRA issue](TBD)

### Notification
* [GitLab commit chat message](TBD)

## API

The service exposes two API endpoints: HTTP and WebSocket.

### HTTP API

#### List approvement topics

```
GET /v1/approvement
```

**Response body**
```json
{
	"DeployProduction": {
		"description": "Requests to deploy new version of an application.",
		"requireVotes": 2,
		"expireTimeout": 900, // 15 mins
		//"schema": "???"
	},
	"ProvideInitialAccess": {
		"description":  "Requests to provide access for newcomers.",
		"requireVotes": 3,
		"expireTimeout": 600, // 10 mins
		//"schema": "???"
	},
	...
}
```


#### Create approvement question

```
POST /v1/approvement/{{topic}}
```

**Request body:**

```json
{
	"your": "...",
	"own": "...",
	"body": "..."
}
```

NOTE: The **Request body** is passed into [Mustache](https://mustache.github.io/) renderer. So this body depends on your `renderTemplate`.

**Response body**

```json
{
	"approvementId": "e5a8627a-e17e1c3ccb8f",
	"topic": "ProvideInitialAccess",
	"requireVotes": 3,
	"expireAt": "2020-10-20T17:40:52.252Z",
	"status": "PENDING",
	"approvedBy": [],
	"refusedBy": null
}
```

#### Get status of an approvement question

```
GET /v1/approvement/{{topic}}/{{approvementId}}
```

**Parameters:**

| **Name**           | **Type**     | **Mandatory**  | **Description**                                                      |
|--------------------|--------------|----------------|----------------------------------------------------------------------|
| **topic**          | STRING       | YES            |                                                                      |
| **approvementId**  | STRING       | YES            |                                                                      |


**Response body**

```json
{
	"approvementId": "e5a8627a-e17e1c3ccb8f",
	"topic": "ProvideInitialAccess",
	"requireVotes": 3,
	"expireAt": "2020-10-20T17:40:52.252Z",
	"status": "REJECTED",
	"approvedBy": [
		{
			"createdAt": "2020-10-18T16:42:18.044Z",
			"source": "telegram",
			"username": "xxxxxxx",
			"chat_id": "-1001494682254",
			"chat_title": "Newcomers Approves",
			"chat_type": "supergroup",
			"message_id": 36
		},
		{
			"createdAt": "2020-10-18T16:42:18.044Z",
			"source": "slack",
			"user": "XXXXXXXX",
			...TBD...
		},
		...
	],
	"refusedBy": {
		"createdAt": "2020-10-18T16:42:18.044Z",
		"source": "telegram",
		"username": "xxxxxxx",
		"chat_id": "-1001494682254",
		"chat_title": "Newcomers Approves",
		"chat_type": "supergroup",
		"message_id": 36
	}
}
```

### WebSocket API



curl -v -X POST -H "Content-Type: application/json" -d '{"appName":"ZXTrader Aggregator","appVerion":"0.1.12"}' http://127.0.0.1:8080/v1/approvement/DeployProduction

curl -v -X POST -H "Content-Type: application/json" -d '{"firstName":"Сергей","lastName":"Иванов","position":"Начинающий PHP гавнокодер","permissions":["Доступ в GitLab","Доступ в БД","Доступ в туалет"]}' http://127.0.0.1:8080/v1/approvement/ProvideInitialAccess
