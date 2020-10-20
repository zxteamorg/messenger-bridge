import { ApprovementTopic } from "./ApprovementTopic";
import { Approver } from "./Approver";
import { ApprovementId } from "./Primitives";

export interface Approvement {
	readonly approvementId: ApprovementId;
	readonly approvementTopic: ApprovementTopic;
	readonly expireAt: Date;
	readonly approvedBy: ReadonlyArray<Approver>;
	readonly refuseBy: Approver | null;
}
