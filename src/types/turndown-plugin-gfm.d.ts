declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export interface GfmOptions {
    strikethrough?: boolean;
    tables?: boolean;
    taskListItems?: boolean;
  }

  export function gfm(turndownService: TurndownService, options?: GfmOptions): void;

  export function strikethrough(turndownService: TurndownService): void;
  export function tables(turndownService: TurndownService): void;
  export function taskListItems(turndownService: TurndownService): void;
  export function highlightedCodeBlock(turndownService: TurndownService): void;
}
