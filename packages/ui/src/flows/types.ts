import type { Task } from "../home/tasks";

/** What every guided flow gets from Home. */
export interface FlowProps {
  task: Task;
  /** The flow finished. `nextTaskId` is the task to open next; without it Home picks the next one. */
  onDone: (nextTaskId?: string) => void;
  /** The person left the flow (the close button). */
  onClose: () => void;
}
