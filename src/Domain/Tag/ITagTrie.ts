import type { TagPath } from './ITagPath.js';

export interface ITagTrieNode<TValue> {
    readonly values: Set<TValue>;
    readonly children: Map<string, ITagTrieNode<TValue>>;
}

export interface ITagTrie<TValue> {
    Insert(tagPath: TagPath, value: TValue): void;
    Remove(tagPath: TagPath, value: TValue): boolean;
    Query(tagPath: TagPath): TValue[];
    QueryExact(tagPath: TagPath): TValue[];
    ListAllTags(): TagPath[];
    Clear(): void;
}
