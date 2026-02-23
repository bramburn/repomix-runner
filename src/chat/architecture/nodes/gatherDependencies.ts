/**
 * gatherDependenciesNode - Parses manifest files for dependency information.
 * 
 * Extracts dependencies from package.json, requirements.txt, Cargo.toml, etc.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ArchitectureState } from '../architectureState.js';

export async function gatherDependenciesNode(
  state: typeof ArchitectureState.State
): Promise<Partial<typeof ArchitectureState.State>> {
  console.log('[Architecture] gatherDependenciesNode: Gathering dependencies...');

  try {
    const repoRoot = state.repoRoot;
    const allDependencies: Record<string, string> = {};

    // Parse package.json (TypeScript/JavaScript)
    const packageJsonPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        
        // Combine dependencies and devDependencies
        const deps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
        
        Object.entries(deps).forEach(([name, version]) => {
          allDependencies[name] = version as string;
        });
        
        console.log(`[Architecture] gatherDependenciesNode: Found ${Object.keys(deps).length} npm dependencies`);
      } catch (error) {
        console.warn('[Architecture] gatherDependenciesNode: Failed to parse package.json:', error);
      }
    }

    // Parse requirements.txt (Python)
    const requirementsPath = path.join(repoRoot, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      try {
        const content = await fs.promises.readFile(requirementsPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            // Parse package==version or package>=version format
            const match = trimmed.match(/^([a-zA-Z0-9_-]+)[=<>!~]+(.+)$/);
            if (match) {
              allDependencies[match[1]] = match[2];
            } else if (trimmed) {
              allDependencies[trimmed] = '*';
            }
          }
        }
        
        console.log(`[Architecture] gatherDependenciesNode: Found Python dependencies`);
      } catch (error) {
        console.warn('[Architecture] gatherDependenciesNode: Failed to parse requirements.txt:', error);
      }
    }

    // Parse Cargo.toml (Rust)
    const cargoTomlPath = path.join(repoRoot, 'Cargo.toml');
    if (fs.existsSync(cargoTomlPath)) {
      try {
        const content = await fs.promises.readFile(cargoTomlPath, 'utf-8');
        
        // Simple TOML parsing for dependencies section
        let inDependencies = false;
        const lines = content.split('\n');
        
        for (const line of lines) {
          if (line.trim() === '[dependencies]') {
            inDependencies = true;
            continue;
          }
          if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
            inDependencies = false;
            continue;
          }
          
          if (inDependencies && line.includes('=')) {
            const [name, version] = line.split('=').map(s => s.trim());
            if (name && version) {
              allDependencies[name] = version.replace(/["']/g, '');
            }
          }
        }
        
        console.log(`[Architecture] gatherDependenciesNode: Found Rust dependencies`);
      } catch (error) {
        console.warn('[Architecture] gatherDependenciesNode: Failed to parse Cargo.toml:', error);
      }
    }

    // Parse go.mod (Go)
    const goModPath = path.join(repoRoot, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = await fs.promises.readFile(goModPath, 'utf-8');
        
        let inRequire = false;
        const lines = content.split('\n');
        
        for (const line of lines) {
          if (line.trim().startsWith('require (')) {
            inRequire = true;
            continue;
          }
          if (line.trim() === ')') {
            inRequire = false;
            continue;
          }
          
          if (inRequire || line.trim().startsWith('require ')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              allDependencies[parts[0]] = parts[1];
            }
          }
        }
        
        console.log(`[Architecture] gatherDependenciesNode: Found Go dependencies`);
      } catch (error) {
        console.warn('[Architecture] gatherDependenciesNode: Failed to parse go.mod:', error);
      }
    }

    console.log(`[Architecture] gatherDependenciesNode: Total dependencies gathered: ${Object.keys(allDependencies).length}`);

    return {
      dependencies: allDependencies,
    };
  } catch (error) {
    console.error('[Architecture] gatherDependenciesNode: Error gathering dependencies:', error);
    return {
      dependencies: {},
    };
  }
}
