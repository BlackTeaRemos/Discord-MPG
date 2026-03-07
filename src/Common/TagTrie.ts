import type { TagPath } from '../Domain/Tag/index.js';
import { TAG_WILDCARD } from '../Domain/Tag/index.js';
import type { ITagTrie, ITagTrieNode } from '../Domain/Tag/index.js';

class TagTrieNode<TValue> implements ITagTrieNode<TValue> {
    public readonly values: Set<TValue> = new Set();
    public readonly children: Map<string, TagTrieNode<TValue>> = new Map();
}

export class TagTrie<TValue> implements ITagTrie<TValue> {
    private _root: TagTrieNode<TValue> = new TagTrieNode();

    public Insert(tagPath: TagPath, value: TValue): void {
        const normalizedPath = NormalizePath(tagPath);
        let currentNode = this._root;

        for (const segment of normalizedPath) {
            if (!currentNode.children.has(segment)) {
                currentNode.children.set(segment, new TagTrieNode());
            }
            currentNode = currentNode.children.get(segment)!;
        }

        currentNode.values.add(value);
    }

    public Remove(tagPath: TagPath, value: TValue): boolean {
        const normalizedPath = NormalizePath(tagPath);
        const nodeAtPath = this.TraverseExact(normalizedPath);

        if (!nodeAtPath || !nodeAtPath.values.has(value)) {
            return false;
        }

        nodeAtPath.values.delete(value);
        this.PruneEmptyBranch(normalizedPath);
        return true;
    }

    public Query(tagPath: TagPath): TValue[] {
        const normalizedPath = NormalizePath(tagPath);
        const collected = new Set<TValue>();
        this.CollectMatching(this._root, normalizedPath, 0, collected);
        return Array.from(collected);
    }

    public QueryExact(tagPath: TagPath): TValue[] {
        const normalizedPath = NormalizePath(tagPath);
        const nodeAtPath = this.TraverseExact(normalizedPath);

        if (!nodeAtPath) {
            return [];
        }

        return Array.from(nodeAtPath.values);
    }

    public ListAllTags(): TagPath[] {
        const results: TagPath[] = [];
        this.CollectPaths(this._root, [], results);
        return results;
    }

    public Clear(): void {
        this._root = new TagTrieNode();
    }

    private CollectMatching(
        node: TagTrieNode<TValue>,
        queryPath: TagPath,
        depth: number,
        collected: Set<TValue>,
    ): void {
        for (const value of node.values) {
            collected.add(value);
        }

        if (depth >= queryPath.length) {
            this.CollectSubtree(node, collected);
            return;
        }

        const segment = queryPath[depth];

        if (segment === TAG_WILDCARD) {
            for (const [, childNode] of node.children) {
                this.CollectMatching(childNode, queryPath, depth + 1, collected);
            }
        } else {
            if (node.children.has(segment)) {
                this.CollectMatching(node.children.get(segment)!, queryPath, depth + 1, collected);
            }
        }
    }

    private CollectSubtree(node: TagTrieNode<TValue>, collected: Set<TValue>): void {
        for (const value of node.values) {
            collected.add(value);
        }

        for (const [, childNode] of node.children) {
            this.CollectSubtree(childNode, collected);
        }
    }

    private CollectPaths(
        node: TagTrieNode<TValue>,
        currentPath: TagPath,
        results: TagPath[],
    ): void {
        if (node.values.size > 0) {
            results.push([...currentPath]);
        }

        for (const [segment, childNode] of node.children) {
            currentPath.push(segment);
            this.CollectPaths(childNode, currentPath, results);
            currentPath.pop();
        }
    }

    private TraverseExact(normalizedPath: TagPath): TagTrieNode<TValue> | null {
        let currentNode: TagTrieNode<TValue> = this._root;

        for (const segment of normalizedPath) {
            if (!currentNode.children.has(segment)) {
                return null;
            }
            currentNode = currentNode.children.get(segment)!;
        }

        return currentNode;
    }

    private PruneEmptyBranch(normalizedPath: TagPath): void {
        const nodeStack: TagTrieNode<TValue>[] = [this._root];

        let currentNode = this._root;
        for (const segment of normalizedPath) {
            if (!currentNode.children.has(segment)) {
                return;
            }
            currentNode = currentNode.children.get(segment)!;
            nodeStack.push(currentNode);
        }

        for (let stackIndex = normalizedPath.length; stackIndex > 0; stackIndex--) {
            const leafNode = nodeStack[stackIndex];
            if (leafNode.values.size > 0 || leafNode.children.size > 0) {
                break;
            }
            const parentNode = nodeStack[stackIndex - 1];
            parentNode.children.delete(normalizedPath[stackIndex - 1]);
        }
    }
}

function NormalizePath(tagPath: TagPath): TagPath {
    return tagPath.map(segment => {
        return segment.toLowerCase().trim();
    });
}
