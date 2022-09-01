export namespace Approver {
	export interface Common {
		readonly createdAt: Date;
		readonly source: string;

		equalTo(other: Approver): boolean;
	}
	export interface Slack extends Common {
		readonly source: "slack";
		readonly user: string;
		// TBD
	}
	export interface Telegram extends Common {
		readonly source: "telegram";
		readonly username: string;
		readonly chat_id: string;
		readonly chat_title: string;
		readonly chat_type: string;
		readonly message_id: number;
	}
}
export type Approver = Approver.Slack | Approver.Telegram;
