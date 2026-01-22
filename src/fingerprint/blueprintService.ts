import { DatabaseService, RepoBlueprint, BlueprintStatus } from '../core/storage/databaseService.js';
import { runFingerprintGraph, FingerprintGraphInput } from './graph.js';
import { ProgressCallback } from './state.js';
import { HashValidator, HashValidationResult } from './validation/hashValidator.js';
import { GitDiffValidator, GitValidationResult } from './validation/gitDiffValidator.js';

/** Default TTL: 24 hours */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Result of blueprint validation.
 */
export interface ValidationResult {
  valid: boolean;
  reason: 'ttl' | 'hash' | 'git' | 'missing' | null;
  details?: string;
  changedFiles?: string[];
}

/**
 * Service for managing repository blueprint lifecycle.
 * Handles generation, validation, and storage of blueprints.
 */
export class BlueprintService {
  private hashValidator: HashValidator;
  private gitValidator: GitDiffValidator;
  private regenerationQueue: Set<string> = new Set();

  constructor(private databaseService: DatabaseService) {
    this.hashValidator = new HashValidator();
    this.gitValidator = new GitDiffValidator();
  }

  /**
   * Get a valid blueprint for a repository.
   * Returns null if no blueprint exists or if it's invalid.
   */
  async getValidBlueprint(repoId: string, repoRoot: string): Promise<RepoBlueprint | null> {
    const blueprint = await this.databaseService.getBlueprint(repoId);
    
    if (!blueprint) {
      return null;
    }

    const validation = await this.validateBlueprint(repoId, repoRoot, blueprint);
    
    if (!validation.valid) {
      console.log(`[BlueprintService] Blueprint invalid: ${validation.reason} - ${validation.details}`);
      return null;
    }

    return blueprint;
  }

  /**
   * Generate a new blueprint for a repository.
   */
  async generateBlueprint(
    input: FingerprintGraphInput,
    onProgress?: ProgressCallback,
    ttlMs: number = DEFAULT_TTL_MS
  ): Promise<RepoBlueprint> {
    console.log(`[BlueprintService] Generating blueprint for ${input.repoId}`);

    // Run the analysis graph
    const result = await runFingerprintGraph(input, onProgress);

    // Create blueprint from analysis result
    const now = Date.now();
    const blueprint: RepoBlueprint = {
      repoId: input.repoId,
      packageInfo: result.packageInfo,
      configFiles: result.configFiles,
      directoryStructure: result.directoryStructure,
      architecturalPatterns: result.architecturalPatterns,
      developmentGuides: result.developmentGuides,
      criticalFileHashes: result.criticalFileHashes,
      lastGitCommit: result.lastGitCommit,
      generatedAt: now,
      expiresAt: now + ttlMs,
      analysisVersion: result.analysisVersion,
      tokensUsed: result.tokensUsed
    };

    // Save to database
    await this.databaseService.saveBlueprint(blueprint);

    console.log(`[BlueprintService] Blueprint saved, expires at ${new Date(blueprint.expiresAt).toISOString()}`);

    return blueprint;
  }

  /**
   * Validate a blueprint using the 4-layer strategy.
   * Layers: TTL → Hash → Git
   * (File watcher is handled separately via queueRegeneration)
   */
  async validateBlueprint(
    repoId: string,
    repoRoot: string,
    blueprint?: RepoBlueprint | null
  ): Promise<ValidationResult> {
    // Get blueprint if not provided
    if (!blueprint) {
      blueprint = await this.databaseService.getBlueprint(repoId);
    }

    if (!blueprint) {
      return { valid: false, reason: 'missing', details: 'No blueprint found' };
    }

    // Layer 1: TTL Check
    const now = Date.now();
    if (now > blueprint.expiresAt) {
      return {
        valid: false,
        reason: 'ttl',
        details: `Blueprint expired at ${new Date(blueprint.expiresAt).toISOString()}`
      };
    }

    // Layer 2: Hash Validation
    if (blueprint.criticalFileHashes && Object.keys(blueprint.criticalFileHashes).length > 0) {
      const hashResult = await this.hashValidator.validate(
        repoRoot,
        blueprint.criticalFileHashes
      );

      if (!hashResult.valid) {
        return {
          valid: false,
          reason: 'hash',
          details: `Files changed: ${hashResult.changedFiles.join(', ')}`,
          changedFiles: hashResult.changedFiles
        };
      }
    }

    // Layer 3: Git Diff Validation
    if (blueprint.lastGitCommit) {
      const gitResult = await this.gitValidator.validate(
        repoRoot,
        blueprint.lastGitCommit
      );

      if (!gitResult.valid) {
        return {
          valid: false,
          reason: 'git',
          details: `${gitResult.changedFiles.length} files changed since ${blueprint.lastGitCommit.substring(0, 7)}`,
          changedFiles: gitResult.changedFiles
        };
      }
    }

    return { valid: true, reason: null };
  }

  /**
   * Get the current status of a blueprint.
   */
  async getBlueprintStatus(repoId: string, repoRoot?: string): Promise<BlueprintStatus> {
    const status = await this.databaseService.getBlueprintStatus(repoId);
    
    // If we have a repo root, also check validation
    if (status.exists && repoRoot) {
      const validation = await this.validateBlueprint(repoId, repoRoot);
      status.valid = validation.valid;
      status.invalidationReason = validation.reason;
    }

    return status;
  }

  /**
   * Queue a repository for blueprint regeneration.
   * Called by file watcher when config files change.
   */
  queueRegeneration(repoId: string): void {
    this.regenerationQueue.add(repoId);
    console.log(`[BlueprintService] Queued regeneration for ${repoId}`);
  }

  /**
   * Check if a repository is queued for regeneration.
   */
  isQueuedForRegeneration(repoId: string): boolean {
    return this.regenerationQueue.has(repoId);
  }

  /**
   * Clear the regeneration queue for a repository.
   * Called after regeneration completes.
   */
  clearRegenerationQueue(repoId: string): void {
    this.regenerationQueue.delete(repoId);
  }

  /**
   * Delete a blueprint.
   */
  async deleteBlueprint(repoId: string): Promise<void> {
    await this.databaseService.deleteBlueprint(repoId);
    this.regenerationQueue.delete(repoId);
    console.log(`[BlueprintService] Deleted blueprint for ${repoId}`);
  }

  /**
   * Refresh blueprint hashes without full regeneration.
   * Useful after validation detects hash changes but you want to keep the blueprint.
   */
  async refreshHashes(repoId: string, repoRoot: string): Promise<void> {
    const hashes = await this.hashValidator.computeCurrentHashes(repoRoot);
    await this.databaseService.updateBlueprintHashes(repoId, hashes);
    console.log(`[BlueprintService] Refreshed hashes for ${repoId}`);
  }

  /**
   * Refresh git commit without full regeneration.
   */
  async refreshGitCommit(repoId: string, repoRoot: string): Promise<void> {
    const commitSha = await this.gitValidator.getCurrentCommit(repoRoot);
    if (commitSha) {
      await this.databaseService.updateBlueprintGitCommit(repoId, commitSha);
      console.log(`[BlueprintService] Refreshed git commit for ${repoId}`);
    }
  }
}

/** Singleton instance (initialized by extension) */
let blueprintServiceInstance: BlueprintService | null = null;

/**
 * Initialize the blueprint service.
 */
export function initBlueprintService(databaseService: DatabaseService): BlueprintService {
  blueprintServiceInstance = new BlueprintService(databaseService);
  return blueprintServiceInstance;
}

/**
 * Get the blueprint service instance.
 */
export function getBlueprintService(): BlueprintService | null {
  return blueprintServiceInstance;
}
