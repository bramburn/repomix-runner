import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { logger } from '../shared/logger.js';

function sanitizeThreadId(threadId: string): string {
  return threadId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class PlanService {
  private readonly workspaceRoot: string;
  private readonly plansDir: string;

  constructor(_context: vscode.ExtensionContext) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this.plansDir = path.join(this.workspaceRoot, '.repomix', 'plans');
  }

  async init(): Promise<void> {
    if (!this.workspaceRoot) {
      return;
    }
    await fs.mkdir(this.plansDir, { recursive: true });
  }

  getPlanPath(threadId: string): string {
    const safeId = sanitizeThreadId(threadId);
    return path.join(this.plansDir, `${safeId}.md`);
  }

  async loadPlan(threadId: string): Promise<string> {
    if (!this.workspaceRoot) {
      return '';
    }

    try {
      return await fs.readFile(this.getPlanPath(threadId), 'utf-8');
    } catch {
      return '';
    }
  }

  async updatePlan(threadId: string, content: string): Promise<string | null> {
    if (!this.workspaceRoot) {
      return null;
    }

    await this.init();
    const planPath = this.getPlanPath(threadId);
    await fs.writeFile(planPath, content, 'utf-8');
    logger.both.info(`PlanService: Updated plan at ${planPath}`);
    return planPath;
  }

  /**
   * Surgical plan edit by exact block replacement.
   * Throws when target block is missing or ambiguous.
   */
  async updatePlanPart(threadId: string, targetText: string, replacementText: string): Promise<string | null> {
    const planPath = this.getPlanPath(threadId);
    let content = '';

    try {
      content = await fs.readFile(planPath, 'utf-8');
    } catch {
      throw new Error('Plan file does not exist yet.');
    }

    const normalizedContent = content.replace(/\r\n/g, '\n');
    const normalizedTarget = targetText.replace(/\r\n/g, '\n');
    const normalizedReplacement = replacementText.replace(/\r\n/g, '\n');

    if (!normalizedTarget.trim()) {
      throw new Error('Target text is empty.');
    }

    if (!normalizedContent.includes(normalizedTarget)) {
      const looseContent = normalizedContent.split('\n').map((line) => line.trim()).join('\n');
      const looseTarget = normalizedTarget.split('\n').map((line) => line.trim()).join('\n');
      if (looseContent.includes(looseTarget)) {
        throw new Error('Target text found but whitespace does not match exactly. Retry with exact whitespace.');
      }
      throw new Error('Target text to replace was not found in the plan.');
    }

    const firstIndex = normalizedContent.indexOf(normalizedTarget);
    const lastIndex = normalizedContent.lastIndexOf(normalizedTarget);
    if (firstIndex !== lastIndex) {
      throw new Error('Target text is ambiguous (found multiple times). Include more context.');
    }

    const nextContent = normalizedContent.replace(normalizedTarget, normalizedReplacement);
    return this.updatePlan(threadId, nextContent);
  }
}
