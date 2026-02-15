declare module '*.svg' {
  const content: string;
  export default content;
}

declare module 'glob-gitignore' {
    import { Ignore } from 'ignore';

    interface GlobOptions {
        cwd?: string;
        ignore?: string | string[] | Ignore;
        nodir?: boolean;
        dot?: boolean;
        [key: string]: any;
    }

    export function glob(pattern: string | string[], options?: GlobOptions): Promise<string[]>;
}
