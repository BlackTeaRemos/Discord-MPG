import { Log } from '../Common/Log.js';
import { TagTrie } from '../Common/TagTrie.js';
import type { TagPath } from '../Domain/Tag/index.js';
import type { ITagWithCount } from '../Domain/Tag/index.js';
import type { IGameObjectTemplate } from '../Domain/GameObject/Entity/IGameObjectTemplate.js';
import type { ITemplateTagService, IMoveTagResult } from './ITemplateTagService.js';

const LOG_TAG = `TemplateTagService`;

export class TemplateTagService implements ITemplateTagService {
    private _gameIndex: Map<string, TagTrie<string>> = new Map();
    private _templateTagMap: Map<string, TagPath[]> = new Map();

    public Initialize(templates: IGameObjectTemplate[]): void {
        this._gameIndex.clear();
        this._templateTagMap.clear();

        let tagCount = 0;
        for (const template of templates) {
            if (!template.tags || template.tags.length === 0) {
                this._templateTagMap.set(template.uid, []);
                continue;
            }

            this._templateTagMap.set(template.uid, [...template.tags]);

            const trie = this.GetOrCreateGameTrie(template.gameUid);
            for (const tagPath of template.tags) {
                trie.Insert(tagPath, template.uid);
                tagCount++;
            }
        }

        Log.info(`Initialized with ${templates.length} templates and ${tagCount} tag paths`, LOG_TAG);
    }

    public AddTag(gameUid: string, templateUid: string, tagPath: TagPath): void {
        const trie = this.GetOrCreateGameTrie(gameUid);
        trie.Insert(tagPath, templateUid);

        const existing = this._templateTagMap.get(templateUid) ?? [];
        existing.push(tagPath);
        this._templateTagMap.set(templateUid, existing);
    }

    public RemoveTag(gameUid: string, templateUid: string, tagPath: TagPath): boolean {
        const trie = this._gameIndex.get(gameUid);
        if (!trie) {
            return false;
        }

        const removed = trie.Remove(tagPath, templateUid);
        if (removed) {
            const existing = this._templateTagMap.get(templateUid) ?? [];
            const pathString = tagPath.join(`/`);
            const filtered = existing.filter(existingPath => {
                return existingPath.join(`/`) !== pathString;
            });
            this._templateTagMap.set(templateUid, filtered);
        }

        return removed;
    }

    public QueryTemplates(gameUid: string, tagPath: TagPath): string[] {
        const trie = this._gameIndex.get(gameUid);
        if (!trie) {
            return [];
        }

        return trie.Query(tagPath);
    }

    public QueryTemplatesExact(gameUid: string, tagPath: TagPath): string[] {
        const trie = this._gameIndex.get(gameUid);
        if (!trie) {
            return [];
        }

        return trie.QueryExact(tagPath);
    }

    public GetTemplateTags(templateUid: string): TagPath[] {
        return this._templateTagMap.get(templateUid) ?? [];
    }

    public ListAllTags(gameUid: string): TagPath[] {
        const trie = this._gameIndex.get(gameUid);
        if (!trie) {
            return [];
        }

        return trie.ListAllTags();
    }

    public ListAllTagsWithCounts(gameUid: string): ITagWithCount[] {
        const trie = this._gameIndex.get(gameUid);
        if (!trie) {
            return [];
        }

        const allPaths = trie.ListAllTags();
        return allPaths.map((path: TagPath) => {
            return {
                path,
                templateCount: trie.QueryExact(path).length,
            };
        });
    }

    public MoveTag(gameUid: string, oldPath: TagPath, newParentPath: TagPath): IMoveTagResult {
        const trie = this._gameIndex.get(gameUid);
        if (!trie) {
            return { affectedTemplateUids: [], updatedTagsByTemplate: new Map() };
        }

        const allTags = trie.ListAllTags();
        const oldPathString = oldPath.join(`/`);
        const movedSegment = oldPath[oldPath.length - 1];
        const newBasePath = [...newParentPath, movedSegment];

        const tagsToMove = allTags.filter((tagPath: TagPath) => {
            const tagString = tagPath.join(`/`);
            return tagString === oldPathString || tagString.startsWith(oldPathString + `/`);
        });

        if (tagsToMove.length === 0) {
            return { affectedTemplateUids: [], updatedTagsByTemplate: new Map() };
        }

        const pathRemapping = new Map<string, TagPath>();
        for (const originalPath of tagsToMove) {
            const suffix = originalPath.slice(oldPath.length);
            pathRemapping.set(originalPath.join(`/`), [...newBasePath, ...suffix]);
        }

        const affectedUidSet = new Set<string>();

        for (const originalPath of tagsToMove) {
            const templateUids = trie.QueryExact(originalPath);
            const remappedPath = pathRemapping.get(originalPath.join(`/`))!;

            for (const uid of templateUids) {
                affectedUidSet.add(uid);
                trie.Remove(originalPath, uid);
                trie.Insert(remappedPath, uid);
            }
        }

        for (const uid of affectedUidSet) {
            const currentTags = this._templateTagMap.get(uid) ?? [];
            const updatedTags = currentTags.map((existingPath: TagPath) => {
                return pathRemapping.get(existingPath.join(`/`)) ?? existingPath;
            });
            this._templateTagMap.set(uid, updatedTags);
        }

        const updatedTagsByTemplate = new Map<string, TagPath[]>();
        for (const uid of affectedUidSet) {
            updatedTagsByTemplate.set(uid, this._templateTagMap.get(uid) ?? []);
        }

        Log.info(`Moved tag ${oldPathString} to ${newBasePath.join(`/`)} affecting ${affectedUidSet.size} templates`, LOG_TAG);

        return {
            affectedTemplateUids: Array.from(affectedUidSet),
            updatedTagsByTemplate,
        };
    }

    private GetOrCreateGameTrie(gameUid: string): TagTrie<string> {
        let trie = this._gameIndex.get(gameUid);
        if (!trie) {
            trie = new TagTrie<string>();
            this._gameIndex.set(gameUid, trie);
        }
        return trie;
    }
}

export const templateTagService = new TemplateTagService();
