/**
 * Domain interfaces and types for the VPI system.
 * This file re-exports all domain interfaces for backward compatibility.
 */

// Object & Versioning Model
export type { ObjectEnvelope, ObjectMeta, TransactionRecord, JsonMutationOp, FieldTagsDelta } from './Object.js';

// Task Model
export type { TaskEntity, TaskListItem, TaskStatus } from './Task.js';
export { DEFAULT_TASK_STATUSES } from './Task.js';

// Query & Pagination Helpers
export type { CursorToken } from './Query.js';

// Repository Interfaces
export type { ObjectRepository } from './Repository.js';

// Utility Types
export type { EventName } from './Utility.js';

// Event Names constant
export { EVENT_NAMES } from './Utility.js';

// Command Module
export type {
    CommandModuleMeta,
    CommandExecutionContext,
    CommandResult,
    CommandModule,
    ExecutionContext,
} from './Command.js';

// Execution Context Implementation
export { CommandExecutionContextImpl, CreateExecutionContext as createExecutionContext } from './ExecutionContext.js';

export type { TagSegment, TagPath, ITagTrieNode, ITagTrie } from './Tag/index.js';
export { TAG_WILDCARD } from './Tag/index.js';
