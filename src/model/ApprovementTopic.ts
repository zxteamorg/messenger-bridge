import { ApprovementTopicName } from "./Primitives";

export interface ApprovementTopic {
	readonly name: ApprovementTopicName;

	readonly description: string;

	readonly requireVotes: number;

	/**
	 * Number of seconds
	 */
	readonly expireTimeout: number;

	readonly authType: string | null;

	readonly schema: string | null;
}
