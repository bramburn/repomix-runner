import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
export const DEFAULT_BRANCH_NAME = 'default_branch';

type GitRepository = {
  rootUri: vscode.Uri;
  state: {
    HEAD?: {
      name?: string;
      commit?: string;
    };
    onDidChange?: (listener: () => void) => vscode.Disposable;
  };
  getBranches?: (opts?: { remote?: boolean }) => Promise<Array<{ name?: string }>>;
  onDidRunOperation?: (listener: () => void) => vscode.Disposable;
};

type GitApi = {
  repositories: GitRepository[];
};

type GitExtension = {
  getAPI(version: number): GitApi | undefined;
};

export class GitService {
  private async getApi(): Promise<GitApi | undefined> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) return undefined;

    if (!extension.isActive) {
      await extension.activate();
    }
    return extension.exports?.getAPI(1);
  }

  private async getRepository(repoRoot: string): Promise<GitRepository | undefined> {
    const api = await this.getApi();
    if (!api?.repositories?.length) return undefined;

    const normalizedRoot = repoRoot.replace(/\\/g, '/');
    return api.repositories.find((repo) => {
      const root = repo.rootUri.fsPath.replace(/\\/g, '/');
      return normalizedRoot === root || normalizedRoot.startsWith(`${root}/`);
    }) ?? api.repositories[0];
  }

  async getCurrentBranch(repoRoot: string): Promise<string> {
    const repo = await this.getRepository(repoRoot);
    const name = repo?.state?.HEAD?.name?.trim();
    return name || DEFAULT_BRANCH_NAME;
  }

  async getCurrentCommitSha(repoRoot: string): Promise<string | undefined> {
    const repo = await this.getRepository(repoRoot);
    return repo?.state?.HEAD?.commit;
  }

  async getLocalBranches(repoRoot: string): Promise<string[]> {
    const repo = await this.getRepository(repoRoot);
    if (!repo) return [];

    if (repo.getBranches) {
      try {
        const branches = await repo.getBranches({ remote: false });
        return branches
          .map((b) => (b.name ?? '').trim())
          .filter(Boolean);
      } catch {
        // Fall through to CLI fallback.
      }
    }

    // Fallback when Git API branch listing is unavailable in the current VS Code Git version.
    try {
      const { stdout } = await execAsync('git branch --format="%(refname:short)"', { cwd: repoRoot });
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async getAllBranches(repoRoot: string): Promise<string[]> {
    const repo = await this.getRepository(repoRoot);
    if (!repo) return [];

    if (repo.getBranches) {
      try {
        const [local, remote] = await Promise.all([
          repo.getBranches({ remote: false }),
          repo.getBranches({ remote: true })
        ]);
        return [...local, ...remote]
          .map((b) => (b.name ?? '').trim())
          .filter(Boolean);
      } catch {
        // Fall through to local-only fallback.
      }
    }

    return this.getLocalBranches(repoRoot);
  }

  async onBranchChange(repoRoot: string, callback: (newBranch: string) => void): Promise<vscode.Disposable> {
    const repo = await this.getRepository(repoRoot);
    if (!repo) {
      return new vscode.Disposable(() => undefined);
    }

    let lastBranch = (repo.state?.HEAD?.name || DEFAULT_BRANCH_NAME).trim();

    const notifyIfChanged = () => {
      const current = (repo.state?.HEAD?.name || DEFAULT_BRANCH_NAME).trim();
      if (current !== lastBranch) {
        lastBranch = current;
        callback(current);
      }
    };

    const disposables: vscode.Disposable[] = [];

    if (repo.onDidRunOperation) {
      disposables.push(repo.onDidRunOperation(notifyIfChanged));
    }
    if (repo.state?.onDidChange) {
      disposables.push(repo.state.onDidChange(notifyIfChanged));
    }

    return new vscode.Disposable(() => disposables.forEach((d) => d.dispose()));
  }
}
