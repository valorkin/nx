import { FileChange, readPackageJson } from '../file-utils';
import {
  getImplicitlyTouchedProjects,
  getTouchedProjects,
} from './locators/workspace-projects';
import { getTouchedNpmPackages } from './locators/npm-packages';
import { getImplicitlyTouchedProjectsByJsonChanges } from './locators/implicit-json-changes';
import {
  AffectedProjectGraphContext,
  TouchedProjectLocator,
} from './affected-project-graph-models';
import { getTouchedProjectsInWorkspaceJson } from './locators/workspace-json-changes';
import { getTouchedProjectsFromTsConfig } from './locators/tsconfig-json-changes';
import { NxJsonConfiguration } from '../../config/nx-json';
import { ProjectGraph } from '../../config/project-graph';
import { reverse } from '../operators';
import { ProjectConfiguration } from '../../config/workspace-json-project-json';
import { readNxJson } from '../../config/configuration';
import { workspaceConfigName } from 'nx/src/config/workspaces';
import { getTouchedProjectsFromProjectGlobChanges } from './locators/project-glob-changes';
import { workspaceRoot } from 'nx/src/utils/workspace-root';

export function filterAffected(
  graph: ProjectGraph<ProjectConfiguration>,
  touchedFiles: FileChange[],
  nxJson: NxJsonConfiguration = readNxJson(),
  packageJson: any = readPackageJson()
): ProjectGraph {
  // Additional affected logic should be in this array.
  const touchedProjectLocators: TouchedProjectLocator[] = [
    getTouchedProjects,
    getImplicitlyTouchedProjects,
    getTouchedNpmPackages,
    getImplicitlyTouchedProjectsByJsonChanges,
    getTouchedProjectsFromTsConfig,
  ];
  if (workspaceConfigName(workspaceRoot)) {
    touchedProjectLocators.push(getTouchedProjectsInWorkspaceJson);
  } else {
    touchedProjectLocators.push(getTouchedProjectsFromProjectGlobChanges);
  }
  const touchedProjects = touchedProjectLocators.reduce((acc, f) => {
    return acc.concat(f(touchedFiles, graph.nodes, nxJson, packageJson, graph));
  }, [] as string[]);

  return filterAffectedProjects(graph, {
    projectGraphNodes: graph.nodes,
    nxJson,
    touchedProjects,
  });
}

// -----------------------------------------------------------------------------

function filterAffectedProjects(
  graph: ProjectGraph,
  ctx: AffectedProjectGraphContext
): ProjectGraph {
  const result: ProjectGraph = {
    nodes: {},
    externalNodes: {},
    dependencies: {},
  };
  const reversed = reverse(graph);
  ctx.touchedProjects.forEach((p) => {
    addAffectedNodes(p, reversed, result, []);
  });
  ctx.touchedProjects.forEach((p) => {
    addAffectedDependencies(p, reversed, result, []);
  });
  return result;
}

function addAffectedNodes(
  startingProject: string,
  reversed: ProjectGraph,
  result: ProjectGraph,
  visited: string[]
): void {
  if (visited.indexOf(startingProject) > -1) return;
  const reversedNode = reversed.nodes[startingProject];
  const reversedExternalNode = reversed.externalNodes[startingProject];
  if (!reversedNode && !reversedExternalNode) {
    throw new Error(`Invalid project name is detected: "${startingProject}"`);
  }
  visited.push(startingProject);
  if (reversedNode) {
    result.nodes[startingProject] = reversedNode;
    result.dependencies[startingProject] = [];
  } else {
    result.externalNodes[startingProject] = reversedExternalNode;
  }
  reversed.dependencies[startingProject]?.forEach(({ target }) =>
    addAffectedNodes(target, reversed, result, visited)
  );
}

function addAffectedDependencies(
  startingProject: string,
  reversed: ProjectGraph,
  result: ProjectGraph,
  visited: string[]
): void {
  if (visited.indexOf(startingProject) > -1) return;
  visited.push(startingProject);
  if (reversed.dependencies[startingProject]) {
    reversed.dependencies[startingProject].forEach(({ target }) =>
      addAffectedDependencies(target, reversed, result, visited)
    );
    reversed.dependencies[startingProject].forEach(
      ({ type, source, target }) => {
        // Since source and target was reversed,
        // we need to reverse it back to original direction.
        if (!result.dependencies[target]) {
          result.dependencies[target] = [];
        }
        result.dependencies[target].push({
          type,
          source: target,
          target: source,
        });
      }
    );
  }
}
