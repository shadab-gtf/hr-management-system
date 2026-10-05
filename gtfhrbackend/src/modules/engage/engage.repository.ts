// Workplace aggregates are isolated by kind, owner and parent in the shared repository.
// Every service command acquires the parent aggregate lock before reading/modifying its children.
export {
  createWorkspaceRepository as createEngageRepository,
  workspaceCommand as engageCommand,
} from "../workspace/workspace.repository.js";
