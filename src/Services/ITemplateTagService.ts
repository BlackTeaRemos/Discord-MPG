import type { TagPath } from '../Domain/Tag/index.js';
import type { ITagWithCount } from '../Domain/Tag/index.js';
import type { IGameObjectTemplate } from '../Domain/GameObject/Entity/IGameObjectTemplate.js';

export interface ITemplateTagService {
    Initialize(templates: IGameObjectTemplate[]): void;
    AddTag(gameUid: string, templateUid: string, tagPath: TagPath): void;
    RemoveTag(gameUid: string, templateUid: string, tagPath: TagPath): boolean;
    MoveTag(gameUid: string, oldPath: TagPath, newParentPath: TagPath): IMoveTagResult;
    QueryTemplates(gameUid: string, tagPath: TagPath): string[];
    QueryTemplatesExact(gameUid: string, tagPath: TagPath): string[];
    GetTemplateTags(templateUid: string): TagPath[];
    ListAllTags(gameUid: string): TagPath[];
    ListAllTagsWithCounts(gameUid: string): ITagWithCount[];
}

export interface IMoveTagResult {
    affectedTemplateUids: string[];
    updatedTagsByTemplate: Map<string, TagPath[]>;
}
