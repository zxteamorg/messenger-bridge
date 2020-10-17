# APPROVE ME

**APPROVE ME** is a helper service to collect approvement votes via messenger networks like Telegram, Slack, etc...

Do you have a business action required collective responsibility? Automate the action approvement in easy and modern way.

![Big View Diagram](doc/asset/approve-me-big-view.png)

## Quick Start

Run **APPROVE ME** inside Docker and use it in few seconds.

```bash
docker run --rm --interactive --tty --env TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11 zxteamorg/approveme
```

Pass your Telegram bot's token into TELEGRAM_BOT_TOKEN environment variable and start to talk with your bot `/start @your_telegram_bot`.

## API

To ask approvement votes, the service exposes two API's: REST and WebSocket+JSON-RPC APIs.

### REST

#### List approvement question topics

```
GET /v1/approvement
```

**Response body**
```json
{
	"ReleaseApp": "Requests for deploy new version of the xxx app.",
	"ProvideAccess": "Requests for provide access for newcomers.",
	...
}
```


#### Create approvement question

```
POST /v1/approvement/{{TOPIC}}
```

**Request body:**

```json
{
	"requireVotes": 3,
	"expireAt": "2020-10-17T17:40:52.252Z",
	"data": "Deploy app v.1.42 to Production"
}
```

**Response body**
```json
{
	"approvementId": "e5a8627a-c06c-4792-abc6-e17e1c3ccb8f"
}
```

#### Get status of an approvement question

```
GET /v1/approvement/{{TOPIC}}/{{approvementId}}
```

**Parameters:**

| **Name**           | **Type**     | **Mandatory**  | **Description**                                                      |
|--------------------|--------------|----------------|----------------------------------------------------------------------|
| **TOPIC**          | STRING       | YES            |                                                                      |
| **approvementId**  | STRING/UUID  | YES            |                                                                      |


**Response body**
```json
{
	"approvementId": "e5a8627a-c06c-4792-abc6-e17e1c3ccb8f",
	"requireVotes": 3,
	"expireAt": "2020-10-17T17:40:52.252Z",
	"approvedVotes": 1
}
```