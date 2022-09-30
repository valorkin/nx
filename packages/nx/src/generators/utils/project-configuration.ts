import { basename, dirname, join, relative } from 'path';
import type { NxJsonConfiguration } from '../../config/nx-json';
import {
  ProjectConfiguration,
  RawProjectsConfigurations,
  ProjectsConfigurations,
} from '../../config/workspace-json-project-json';
import {
  buildWorkspaceConfigurationFromGlobs,
  deduplicateProjectFiles,
  globForProjectFiles,
  reformattedWorkspaceJsonOrNull,
  toNewFormat,
} from '../../config/workspaces';
import { joinPathFragments, normalizePath } from '../../utils/path';

import type { Tree } from '../tree';

import { readJson, updateJson, writeJson } from './json';

export type WorkspaceConfiguration = Omit<ProjectsConfigurations, 'projects'> &
  Partial<NxJsonConfiguration>;

/**
 * Adds project configuration to the Nx workspace.
 *
 * The project configuration is stored in workspace.json or the associated project.json file.
 * The utility will update either files.
 *
 * @param tree - the file system tree
 * @param projectName - unique name. Often directories are part of the name (e.g., mydir-mylib)
 * @param projectConfiguration - project configuration
 * @param standalone - should the project use package.json? If false, the project config is inside workspace.json
 */
export function addProjectConfiguration(
  tree: Tree,
  projectName: string,
  projectConfiguration: ProjectConfiguration,
  standalone?: boolean
): void {
  standalone = standalone ?? shouldDefaultToUsingStandaloneConfigs(tree);
  setProjectConfiguration(
    tree,
    projectName,
    projectConfiguration,
    'create',
    standalone
  );
}

/**
 * Updates the configuration of an existing project.
 *
 * The project configuration is stored in workspace.json or the associated project.json file.
 * The utility will update either files.
 *
 * @param tree - the file system tree
 * @param projectName - unique name. Often directories are part of the name (e.g., mydir-mylib)
 * @param projectConfiguration - project configuration
 */
export function updateProjectConfiguration(
  tree: Tree,
  projectName: string,
  projectConfiguration: ProjectConfiguration
): void {
  setProjectConfiguration(tree, projectName, projectConfiguration, 'update');
}

/**
 * Removes the configuration of an existing project.
 *
 * The project configuration is stored in workspace.json or the associated project.json file.
 * The utility will update either file.
 */
export function removeProjectConfiguration(
  tree: Tree,
  projectName: string
): void {
  setProjectConfiguration(tree, projectName, undefined, 'delete');
}

/**
 * Get a map of all projects in a workspace.
 *
 * Use {@link readProjectConfiguration} if only one project is needed.
 */
export function getProjects(tree: Tree): Map<string, ProjectConfiguration> {
  const workspace = readWorkspace(tree);

  return new Map(
    Object.keys(workspace.projects || {}).map((projectName) => {
      return [projectName, getProjectConfiguration(projectName, workspace)];
    })
  );
}

/**
 * Read general workspace configuration such as the default project or cli settings
 *
 * This does _not_ provide projects configuration, use {@link readProjectConfiguration} instead.
 */
export function readWorkspaceConfiguration(tree: Tree): WorkspaceConfiguration {
  const { projects, ...workspace } = readRawWorkspaceJson(tree); // Create a new object, without projects

  let nxJson = readNxJson(tree);
  if (nxJson === null) {
    return workspace;
  }

  return {
    ...workspace,
    ...nxJson,
  };
}

/**
 * Update general workspace configuration such as the default project or cli settings.
 *
 * This does _not_ update projects configuration, use {@link updateProjectConfiguration} or {@link addProjectConfiguration} instead.
 */
export function updateWorkspaceConfiguration(
  tree: Tree,
  workspaceConfig: WorkspaceConfiguration
): void {
  const {
    // Nx Json Properties
    cli,
    defaultProject,
    generators,
    implicitDependencies,
    plugins,
    pluginsConfig,
    npmScope,
    namedInputs,
    targetDefaults,
    targetDependencies,
    workspaceLayout,
    tasksRunnerOptions,
    affected,
    extends: ext,
  } = workspaceConfig;

  const nxJson: Required<NxJsonConfiguration> = {
    implicitDependencies,
    plugins,
    pluginsConfig,
    npmScope,
    namedInputs,
    targetDefaults,
    targetDependencies,
    workspaceLayout,
    tasksRunnerOptions,
    affected,
    cli,
    generators,
    defaultProject,
    extends: ext,
  };

  if (tree.exists('nx.json')) {
    updateJson<NxJsonConfiguration>(tree, 'nx.json', (json) => {
      if (json.extends) {
        const nxJsonExtends = readNxJsonExtends(tree, json.extends);
        const changedPropsOfNxJson = {};
        Object.keys(nxJson).forEach((prop) => {
          if (
            JSON.stringify(nxJson[prop], null, 2) !=
            JSON.stringify(nxJsonExtends[prop], null, 2)
          ) {
            changedPropsOfNxJson[prop] = nxJson[prop];
          }
        });
        return { ...json, ...changedPropsOfNxJson };
      } else {
        return { ...json, ...nxJson };
      }
    });
  }

  // Only prop in workspace.json is version. If there is no
  // workspace.json file, this f(x) doesn't update anything
  // in project config.
  const workspacePath = getWorkspacePath(tree);
  if (workspacePath) {
    updateJson<ProjectsConfigurations>(tree, workspacePath, (json) => {
      const config = {
        ...json,
        version: workspaceConfig.version,
      };
      if (!(workspaceConfig as any).newProjectRoot) {
        delete (config as any).newProjectRoot;
      }
      return config;
    });
  }
}

function readNxJsonExtends(tree: Tree, extendsPath: string) {
  try {
    return readJson(
      tree,
      relative(
        tree.root,
        require.resolve(extendsPath, {
          paths: [tree.root],
        })
      )
    );
  } catch (e) {
    throw new Error(`Unable to resolve nx.json extends. Error: ${e.message}`);
  }
}

/**
 * Reads a project configuration.
 *
 * The project configuration is stored in workspace.json or the associated project.json file.
 * The utility will read from either file.
 *
 * @param tree - the file system tree
 * @param projectName - unique name. Often directories are part of the name (e.g., mydir-mylib)
 * @throws If supplied projectName cannot be found
 */
export function readProjectConfiguration(
  tree: Tree,
  projectName: string
): ProjectConfiguration {
  const workspace = readWorkspace(tree);
  if (!workspace.projects[projectName]) {
    throw new Error(
      getWorkspacePath(tree)
        ? `Cannot find configuration for '${projectName}' in ${getWorkspacePath(
            tree
          )}.`
        : `Cannot find configuration for '${projectName}'`
    );
  }

  return getProjectConfiguration(projectName, workspace);
}

export function readNxJson(tree: Tree): NxJsonConfiguration | null {
  if (!tree.exists('nx.json')) {
    return null;
  }
  let nxJson = readJson<NxJsonConfiguration>(tree, 'nx.json');
  if (nxJson.extends) {
    nxJson = { ...readNxJsonExtends(tree, nxJson.extends), ...nxJson };
  }
  return nxJson;
}

/**
 * Returns if a project has a standalone configuration (project.json).
 *
 * @param tree - the file system tree
 * @param project - the project name
 */
export function isStandaloneProject(tree: Tree, project: string): boolean {
  const path = getWorkspacePath(tree);
  const rawWorkspace =
    path && tree.exists(path)
      ? readJson<RawProjectsConfigurations>(tree, path)
      : null;
  if (rawWorkspace) {
    const projectConfig = rawWorkspace.projects?.[project];
    return typeof projectConfig === 'string';
  }
  return true;
}

function getProjectConfiguration(
  projectName: string,
  workspace: ProjectsConfigurations
): ProjectConfiguration {
  return {
    ...readWorkspaceSection(workspace, projectName),
  };
}

function readWorkspaceSection(
  workspace: ProjectsConfigurations,
  projectName: string
) {
  return workspace.projects[projectName];
}

function setProjectConfiguration(
  tree: Tree,
  projectName: string,
  projectConfiguration: ProjectConfiguration,
  mode: 'create' | 'update' | 'delete',
  standalone: boolean = false
): void {
  if (mode === 'delete') {
    addProjectToWorkspaceJson(
      tree,
      projectName,
      readProjectConfiguration(tree, projectName),
      mode
    );
    return;
  }

  if (!projectConfiguration) {
    throw new Error(
      `Cannot ${mode} "${projectName}" with value ${projectConfiguration}`
    );
  }

  addProjectToWorkspaceJson(
    tree,
    projectName,
    projectConfiguration,
    mode,
    standalone
  );
}

export function getRelativeProjectJsonSchemaPath(
  tree: Tree,
  project: ProjectConfiguration
): string {
  return normalizePath(
    relative(
      join(tree.root, project.root),
      join(tree.root, 'node_modules/nx/schemas/project-schema.json')
    )
  );
}

function addProjectToWorkspaceJson(
  tree: Tree,
  projectName: string,
  project: ProjectConfiguration,
  mode: 'create' | 'update' | 'delete',
  standalone: boolean = false
) {
  const workspaceConfigPath = getWorkspacePath(tree);
  const workspaceJson = readRawWorkspaceJson(tree);
  if (workspaceConfigPath) {
    validateProjectConfigurationOperationsGivenWorkspaceJson(
      mode,
      workspaceJson,
      projectName
    );
  } else {
    validateProjectConfigurationOperationsWithoutWorkspaceJson(
      mode,
      projectName,
      project.root,
      tree
    );
  }

  const configFile =
    (mode === 'create' && standalone) || !workspaceConfigPath
      ? joinPathFragments(project.root, 'project.json')
      : getProjectFileLocation(tree, projectName);
  const jsonSchema =
    configFile && mode === 'create'
      ? { $schema: getRelativeProjectJsonSchemaPath(tree, project) }
      : {};

  if (configFile) {
    if (mode === 'delete') {
      tree.delete(configFile);
      delete workspaceJson.projects[projectName];
    } else {
      // keep real workspace up to date
      if (workspaceConfigPath && mode === 'create') {
        workspaceJson.projects[projectName] = project.root;
      }

      // update the project.json file
      writeJson(tree, configFile, {
        ...jsonSchema,
        name: mode === 'create' ? projectName : project.name,
        ...project,
        root: undefined,
      });
    }
  } else if (mode === 'delete') {
    delete workspaceJson.projects[projectName];
  } else {
    workspaceJson.projects[projectName] = project;
  }
  if (workspaceConfigPath && tree.exists(workspaceConfigPath)) {
    writeJson(
      tree,
      workspaceConfigPath,
      reformattedWorkspaceJsonOrNull(workspaceJson) ?? workspaceJson
    );
  }
}

/**
 * Read the workspace configuration, including projects.
 */
export function readWorkspace(tree: Tree): ProjectsConfigurations {
  const workspaceJson = inlineProjectConfigurationsWithTree(tree);
  const originalVersion = workspaceJson.version;
  return {
    ...toNewFormat(workspaceJson),
    version: originalVersion,
  };
}

/**
 * This has to be separate from the inline functionality inside nx,
 * as the functionality in nx does not use a Tree. Changes made during
 * a generator would not be present during runtime execution.
 * @returns
 */
function inlineProjectConfigurationsWithTree(
  tree: Tree
): ProjectsConfigurations {
  const workspaceJson = readRawWorkspaceJson(tree);
  Object.entries(workspaceJson.projects || {}).forEach(([project, config]) => {
    if (typeof config === 'string') {
      const configFileLocation = joinPathFragments(config, 'project.json');
      workspaceJson.projects[project] = {
        root: config,
        ...readJson<ProjectConfiguration>(tree, configFileLocation),
      };
    }
  });
  return workspaceJson as ProjectsConfigurations;
}

/**
 * Used to ensure that projects created during
 * the same devkit generator run show up when
 * there is no workspace.json file, as `glob`
 * cannot find them.
 */
function findCreatedProjects(tree: Tree) {
  const files = tree
    .listChanges()
    .filter((f) => {
      const fileName = basename(f.path);
      return (
        f.type === 'CREATE' &&
        (fileName === 'project.json' || fileName === 'package.json')
      );
    })
    .map((x) => x.path);
  return deduplicateProjectFiles(files);
}

/**
 * Used to ensure that projects created during
 * the same devkit generator run show up when
 * there is no workspace.json file, as `glob`
 * cannot find them.
 */
function findDeletedProjects(tree: Tree) {
  return tree.listChanges().filter((f) => {
    const fileName = basename(f.path);
    return (
      f.type === 'DELETE' &&
      (fileName === 'project.json' || fileName === 'package.json')
    );
  });
}

let staticFSWorkspace: RawProjectsConfigurations;
function readRawWorkspaceJson(tree: Tree): RawProjectsConfigurations {
  const path = getWorkspacePath(tree);
  if (path && tree.exists(path)) {
    // `workspace.json` exists, use it.
    return readJson<RawProjectsConfigurations>(tree, path);
  } else {
    const nxJson = readNxJson(tree);
    const createdProjects = buildWorkspaceConfigurationFromGlobs(
      nxJson,
      findCreatedProjects(tree),
      (file) => readJson(tree, file)
    ).projects;
    // We already have built a cache
    if (!staticFSWorkspace) {
      staticFSWorkspace = buildWorkspaceConfigurationFromGlobs(
        nxJson,
        [...globForProjectFiles(tree.root, nxJson)],
        (file) => readJson(tree, file)
      );
    }
    const projects = { ...staticFSWorkspace.projects, ...createdProjects };
    findDeletedProjects(tree).forEach((file) => {
      const matchingStaticProject = Object.entries(projects).find(
        ([, config]) =>
          typeof config === 'string'
            ? config === dirname(file.path)
            : config.root === dirname(file.path)
      );

      if (matchingStaticProject) {
        delete projects[matchingStaticProject[0]];
      }
    });
    return {
      ...staticFSWorkspace,
      projects,
    };
  }
}

/**
 * @description Determine where a project's configuration is located.
 * @returns file path if separate from root config, null otherwise.
 */
function getProjectFileLocation(tree: Tree, project: string): string | null {
  const rawWorkspace = readRawWorkspaceJson(tree);
  const projectConfig = rawWorkspace.projects?.[project];
  return typeof projectConfig === 'string'
    ? joinPathFragments(projectConfig, 'project.json')
    : null;
}

function validateProjectConfigurationOperationsGivenWorkspaceJson(
  mode: 'create' | 'update' | 'delete',
  workspaceJson: RawProjectsConfigurations | ProjectsConfigurations | null,
  projectName: string
) {
  if (mode == 'create' && workspaceJson.projects[projectName]) {
    throw new Error(
      `Cannot create Project '${projectName}'. It already exists.`
    );
  }
  if (mode == 'update' && !workspaceJson.projects[projectName]) {
    throw new Error(
      `Cannot update Project '${projectName}'. It does not exist.`
    );
  }
  if (mode == 'delete' && !workspaceJson.projects[projectName]) {
    throw new Error(
      `Cannot delete Project '${projectName}'. It does not exist.`
    );
  }
}

function validateProjectConfigurationOperationsWithoutWorkspaceJson(
  mode: 'create' | 'update' | 'delete',
  projectName: string,
  projectRoot: string,
  tree: Tree
) {
  if (
    mode == 'create' &&
    tree.exists(joinPathFragments(projectRoot, 'project.json'))
  ) {
    throw new Error(
      `Cannot create a new project at ${projectRoot}. It already exists.`
    );
  }
  if (
    mode == 'update' &&
    !tree.exists(joinPathFragments(projectRoot, 'project.json'))
  ) {
    throw new Error(
      `Cannot update Project ${projectName} at ${projectRoot}. It doesn't exist or uses package.json configuration.`
    );
  }
  if (mode == 'delete' && !tree.exists(joinPathFragments(projectRoot))) {
    throw new Error(
      `Cannot delete Project ${projectName}. It doesn't exist or uses package.json configuration.`
    );
  }
}

export function shouldDefaultToUsingStandaloneConfigs(tree: Tree): boolean {
  const workspacePath = getWorkspacePath(tree);
  const rawWorkspace =
    workspacePath && tree.exists(workspacePath)
      ? readJson<RawProjectsConfigurations>(tree, workspacePath)
      : null;
  return !rawWorkspace
    ? true // if workspace.json doesn't exist, all projects **must** be standalone
    : Object.values(rawWorkspace.projects).reduce(
        // default for second, third... projects should be based on all projects being defined as a path
        // for configuration read from ng schematics, this is determined by configFilePath's presence
        (allStandalone, next) =>
          allStandalone &&
          (typeof next === 'string' || 'configFilePath' in next),

        // default for first project should be true if using Nx Schema
        rawWorkspace.version > 1
      );
}

export function getWorkspacePath(
  tree: Tree
): '/angular.json' | '/workspace.json' | null {
  const possibleFiles: ('/angular.json' | '/workspace.json')[] = [
    '/angular.json',
    '/workspace.json',
  ];
  return possibleFiles.filter((path) => tree.exists(path))[0];
}
