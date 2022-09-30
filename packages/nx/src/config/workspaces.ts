import { sync as globSync } from 'fast-glob';
import { existsSync, readFileSync } from 'fs';
import ignore, { Ignore } from 'ignore';
import * as path from 'path';
import { basename, dirname, join } from 'path';
import { performance } from 'perf_hooks';

import { workspaceRoot } from '../utils/workspace-root';
import { readJsonFile } from '../utils/fileutils';
import { logger } from '../utils/logger';
import { loadNxPlugins, readPluginPackageJson } from '../utils/nx-plugin';
import * as yaml from 'js-yaml';

import type { NxJsonConfiguration } from './nx-json';
import {
  ProjectConfiguration,
  ProjectsConfigurations,
} from './workspace-json-project-json';
import {
  CustomHasher,
  Executor,
  ExecutorConfig,
  ExecutorsJson,
  Generator,
  GeneratorsJson,
  TaskGraphExecutor,
} from './misc-interfaces';
import { PackageJson } from '../utils/package-json';
import { sortObjectByKeys } from 'nx/src/utils/object-sort';

export function workspaceConfigName(
  root: string
): 'angular.json' | 'workspace.json' | null {
  if (existsSync(path.join(root, 'angular.json'))) {
    return 'angular.json';
  } else if (existsSync(path.join(root, 'workspace.json'))) {
    return 'workspace.json';
  } else {
    return null;
  }
}

export class Workspaces {
  private cachedWorkspaceConfig: ProjectsConfigurations & NxJsonConfiguration;

  constructor(private root: string) {}

  relativeCwd(cwd: string) {
    return path.relative(this.root, cwd).replace(/\\/g, '/') || null;
  }

  calculateDefaultProjectName(
    cwd: string,
    wc: ProjectsConfigurations & NxJsonConfiguration
  ) {
    const relativeCwd = this.relativeCwd(cwd);
    if (relativeCwd) {
      const matchingProject = Object.keys(wc.projects).find((p) => {
        const projectRoot = wc.projects[p].root;
        return (
          relativeCwd == projectRoot ||
          relativeCwd.startsWith(`${projectRoot}/`)
        );
      });
      if (matchingProject) return matchingProject;
    }
    return wc.defaultProject;
  }

  readWorkspaceConfiguration(opts?: {
    _ignorePluginInference?: boolean;
  }): ProjectsConfigurations & NxJsonConfiguration {
    if (
      this.cachedWorkspaceConfig &&
      process.env.NX_CACHE_WORKSPACE_CONFIG !== 'false'
    ) {
      return this.cachedWorkspaceConfig;
    }
    const nxJson = this.readNxJson();
    const workspaceFile = workspaceConfigName(this.root);
    const workspacePath = workspaceFile
      ? path.join(this.root, workspaceFile)
      : null;
    const workspace =
      workspacePath && existsSync(workspacePath)
        ? this.readFromWorkspaceJson()
        : buildWorkspaceConfigurationFromGlobs(
            nxJson,
            globForProjectFiles(
              this.root,
              nxJson,
              opts?._ignorePluginInference
            ),
            (path) => readJsonFile(join(this.root, path))
          );

    assertValidWorkspaceConfiguration(nxJson);
    this.cachedWorkspaceConfig = {
      ...this.mergeTargetDefaultsIntoProjectDescriptions(workspace, nxJson),
      ...nxJson,
    };
    return this.cachedWorkspaceConfig;
  }

  private mergeTargetDefaultsIntoProjectDescriptions(
    config: ProjectsConfigurations,
    nxJson: NxJsonConfiguration
  ) {
    for (const proj of Object.values(config.projects)) {
      if (proj.targets) {
        for (const targetName of Object.keys(proj.targets)) {
          if (nxJson.targetDefaults[targetName]) {
            const projectTargetDefinition = proj.targets[targetName];
            if (!projectTargetDefinition.outputs) {
              projectTargetDefinition.outputs =
                nxJson.targetDefaults[targetName].outputs;
            }
            if (!projectTargetDefinition.dependsOn) {
              projectTargetDefinition.dependsOn =
                nxJson.targetDefaults[targetName].dependsOn;
            }
          }
        }
      }
    }
    return config;
  }

  isNxExecutor(nodeModule: string, executor: string) {
    const schema = this.readExecutor(nodeModule, executor).schema;
    return schema['cli'] === 'nx';
  }

  isNxGenerator(collectionName: string, generatorName: string) {
    const schema = this.readGenerator(collectionName, generatorName).schema;
    return schema['cli'] === 'nx';
  }

  readExecutor(nodeModule: string, executor: string): ExecutorConfig {
    try {
      const { executorsFilePath, executorConfig } = this.readExecutorsJson(
        nodeModule,
        executor
      );
      const executorsDir = path.dirname(executorsFilePath);
      const schemaPath = path.join(executorsDir, executorConfig.schema || '');
      const schema = readJsonFile(schemaPath);
      if (!schema.properties || typeof schema.properties !== 'object') {
        schema.properties = {};
      }
      const implementationFactory = this.getImplementationFactory<Executor>(
        executorConfig.implementation,
        executorsDir
      );

      const batchImplementationFactory = executorConfig.batchImplementation
        ? this.getImplementationFactory<TaskGraphExecutor>(
            executorConfig.batchImplementation,
            executorsDir
          )
        : null;

      const hasherFactory = executorConfig.hasher
        ? this.getImplementationFactory<CustomHasher>(
            executorConfig.hasher,
            executorsDir
          )
        : null;

      return {
        schema,
        implementationFactory,
        batchImplementationFactory,
        hasherFactory,
      };
    } catch (e) {
      throw new Error(
        `Unable to resolve ${nodeModule}:${executor}.\n${e.message}`
      );
    }
  }

  readGenerator(collectionName: string, generatorName: string) {
    try {
      const {
        generatorsFilePath,
        generatorsJson,
        resolvedCollectionName,
        normalizedGeneratorName,
      } = this.readGeneratorsJson(collectionName, generatorName);
      const generatorsDir = path.dirname(generatorsFilePath);
      const generatorConfig =
        generatorsJson.generators?.[normalizedGeneratorName] ||
        generatorsJson.schematics?.[normalizedGeneratorName];
      const schemaPath = path.join(generatorsDir, generatorConfig.schema || '');
      const schema = readJsonFile(schemaPath);
      if (!schema.properties || typeof schema.properties !== 'object') {
        schema.properties = {};
      }
      generatorConfig.implementation =
        generatorConfig.implementation || generatorConfig.factory;
      const implementationFactory = this.getImplementationFactory<Generator>(
        generatorConfig.implementation,
        generatorsDir
      );
      return {
        resolvedCollectionName,
        normalizedGeneratorName,
        schema,
        implementationFactory,
        aliases: generatorConfig.aliases || [],
      };
    } catch (e) {
      throw new Error(
        `Unable to resolve ${collectionName}:${generatorName}.\n${e.message}`
      );
    }
  }

  hasNxJson(): boolean {
    const nxJson = path.join(this.root, 'nx.json');
    return existsSync(nxJson);
  }

  readNxJson(): NxJsonConfiguration {
    const nxJson = path.join(this.root, 'nx.json');
    if (existsSync(nxJson)) {
      const nxJsonConfig = readJsonFile<NxJsonConfiguration>(nxJson);
      if (nxJsonConfig.extends) {
        const extendedNxJsonPath = require.resolve(nxJsonConfig.extends, {
          paths: [dirname(nxJson)],
        });
        const baseNxJson =
          readJsonFile<NxJsonConfiguration>(extendedNxJsonPath);
        return this.mergeTargetDefaultsAndTargetDependencies({
          ...baseNxJson,
          ...nxJsonConfig,
        });
      } else {
        return this.mergeTargetDefaultsAndTargetDependencies(nxJsonConfig);
      }
    } else {
      try {
        return this.mergeTargetDefaultsAndTargetDependencies(
          readJsonFile(join(__dirname, '..', '..', 'presets', 'core.json'))
        );
      } catch (e) {
        return {};
      }
    }
  }

  private mergeTargetDefaultsAndTargetDependencies(
    nxJson: NxJsonConfiguration
  ) {
    if (!nxJson.targetDefaults) {
      nxJson.targetDefaults = {};
    }
    if (nxJson.targetDependencies) {
      for (const targetName of Object.keys(nxJson.targetDependencies)) {
        if (!nxJson.targetDefaults[targetName]) {
          nxJson.targetDefaults[targetName] = {};
        }
        if (!nxJson.targetDefaults[targetName].dependsOn) {
          nxJson.targetDefaults[targetName].dependsOn = [];
        }
        nxJson.targetDefaults[targetName].dependsOn = [
          ...nxJson.targetDefaults[targetName].dependsOn,
          ...nxJson.targetDependencies[targetName],
        ];
      }
    }
    return nxJson;
  }

  private getImplementationFactory<T>(
    implementation: string,
    directory: string
  ): () => T {
    const [implementationModulePath, implementationExportName] =
      implementation.split('#');
    return () => {
      const module = require(path.join(directory, implementationModulePath));
      return implementationExportName
        ? module[implementationExportName]
        : module.default ?? module;
    };
  }

  private readExecutorsJson(nodeModule: string, executor: string) {
    const { json: packageJson, path: packageJsonPath } = readPluginPackageJson(
      nodeModule,
      this.resolvePaths()
    );
    const executorsFile = packageJson.executors ?? packageJson.builders;

    if (!executorsFile) {
      throw new Error(
        `The "${nodeModule}" package does not support Nx executors.`
      );
    }

    const executorsFilePath = require.resolve(
      path.join(path.dirname(packageJsonPath), executorsFile)
    );
    const executorsJson = readJsonFile<ExecutorsJson>(executorsFilePath);
    const executorConfig: {
      implementation: string;
      batchImplementation?: string;
      schema: string;
      hasher?: string;
    } =
      executorsJson.executors?.[executor] || executorsJson.builders?.[executor];
    if (!executorConfig) {
      throw new Error(
        `Cannot find executor '${executor}' in ${executorsFilePath}.`
      );
    }
    return { executorsFilePath, executorConfig };
  }

  private readGeneratorsJson(
    collectionName: string,
    generator: string
  ): {
    generatorsFilePath: string;
    generatorsJson: GeneratorsJson;
    normalizedGeneratorName: string;
    resolvedCollectionName: string;
  } {
    let generatorsFilePath;
    if (collectionName.endsWith('.json')) {
      generatorsFilePath = require.resolve(collectionName, {
        paths: this.resolvePaths(),
      });
    } else {
      const { json: packageJson, path: packageJsonPath } =
        readPluginPackageJson(collectionName, this.resolvePaths());
      const generatorsFile = packageJson.generators ?? packageJson.schematics;

      if (!generatorsFile) {
        throw new Error(
          `The "${collectionName}" package does not support Nx generators.`
        );
      }

      generatorsFilePath = require.resolve(
        path.join(path.dirname(packageJsonPath), generatorsFile)
      );
    }
    const generatorsJson = readJsonFile<GeneratorsJson>(generatorsFilePath);

    let normalizedGeneratorName =
      findFullGeneratorName(generator, generatorsJson.generators) ||
      findFullGeneratorName(generator, generatorsJson.schematics);

    if (!normalizedGeneratorName) {
      for (let parent of generatorsJson.extends || []) {
        try {
          return this.readGeneratorsJson(parent, generator);
        } catch (e) {}
      }

      throw new Error(
        `Cannot find generator '${generator}' in ${generatorsFilePath}.`
      );
    }
    return {
      generatorsFilePath,
      generatorsJson,
      normalizedGeneratorName,
      resolvedCollectionName: collectionName,
    };
  }

  private resolvePaths() {
    return this.root ? [this.root, __dirname] : [__dirname];
  }

  private readFromWorkspaceJson() {
    const rawWorkspace = readJsonFile(
      path.join(this.root, workspaceConfigName(this.root))
    );
    return resolveNewFormatWithInlineProjects(rawWorkspace, this.root);
  }
}

function assertValidWorkspaceConfiguration(
  nxJson: NxJsonConfiguration & { projects?: any }
) {
  // Assert valid workspace configuration
  if (nxJson.projects) {
    logger.warn(
      'NX As of Nx 13, project configuration should be moved from nx.json to workspace.json/project.json. Please run "nx format" to fix this.'
    );
  }
}

function findFullGeneratorName(
  name: string,
  generators: {
    [name: string]: { aliases?: string[] };
  }
) {
  if (generators) {
    for (let [key, data] of Object.entries<{ aliases?: string[] }>(
      generators
    )) {
      if (
        key === name ||
        (data.aliases && (data.aliases as string[]).includes(name))
      ) {
        return key;
      }
    }
  }
}

export function reformattedWorkspaceJsonOrNull(w: any) {
  const workspaceJson =
    w.version === 2 ? toNewFormatOrNull(w) : toOldFormatOrNull(w);
  if (workspaceJson?.projects) {
    workspaceJson.projects = sortObjectByKeys(workspaceJson.projects);
  }

  return workspaceJson;
}

export function toNewFormat(w: any): ProjectsConfigurations {
  const f = toNewFormatOrNull(w);
  return f ?? w;
}

export function toNewFormatOrNull(w: any) {
  let formatted = false;
  Object.values(w.projects || {}).forEach((projectConfig: any) => {
    if (projectConfig.architect) {
      renamePropertyWithStableKeys(projectConfig, 'architect', 'targets');
      formatted = true;
    }
    if (projectConfig.schematics) {
      renamePropertyWithStableKeys(projectConfig, 'schematics', 'generators');
      formatted = true;
    }
    Object.values(projectConfig.targets || {}).forEach((target: any) => {
      if (target.builder !== undefined) {
        renamePropertyWithStableKeys(target, 'builder', 'executor');
        formatted = true;
      }
    });
  });
  if (w.schematics) {
    renamePropertyWithStableKeys(w, 'schematics', 'generators');
    formatted = true;
  }
  if (w.version !== 2) {
    w.version = 2;
    formatted = true;
  }
  return formatted ? w : null;
}

export function toOldFormatOrNull(w: any) {
  let formatted = false;

  Object.values(w.projects || {}).forEach((projectConfig: any) => {
    if (typeof projectConfig === 'string') {
      throw new Error(
        "'project.json' files are incompatible with version 1 workspace schemas."
      );
    }
    if (projectConfig.targets) {
      renamePropertyWithStableKeys(projectConfig, 'targets', 'architect');
      formatted = true;
    }
    if (projectConfig.generators) {
      renamePropertyWithStableKeys(projectConfig, 'generators', 'schematics');
      formatted = true;
    }
    delete projectConfig.name;
    Object.values(projectConfig.architect || {}).forEach((target: any) => {
      if (target.executor !== undefined) {
        renamePropertyWithStableKeys(target, 'executor', 'builder');
        formatted = true;
      }
    });
  });

  if (w.generators) {
    renamePropertyWithStableKeys(w, 'generators', 'schematics');
    formatted = true;
  }
  if (w.version !== 1) {
    w.version = 1;
    formatted = true;
  }
  return formatted ? w : null;
}

export function resolveOldFormatWithInlineProjects(
  w: any,
  root: string = workspaceRoot
) {
  const inlined = inlineProjectConfigurations(w, root);
  const formatted = toOldFormatOrNull(inlined);
  return formatted ? formatted : inlined;
}

export function resolveNewFormatWithInlineProjects(
  w: any,
  root: string = workspaceRoot
) {
  return toNewFormat(inlineProjectConfigurations(w, root));
}

function inlineProjectConfigurations(w: any, root: string = workspaceRoot) {
  Object.entries(w.projects || {}).forEach(
    ([project, config]: [string, any]) => {
      if (typeof config === 'string') {
        const configFilePath = path.join(root, config, 'project.json');
        const fileConfig = readJsonFile(configFilePath);
        w.projects[project] = {
          root: config,
          ...fileConfig,
        };
      }
    }
  );
  return w;
}

/**
 * Reads an nx.json file from a given path or extends a local nx.json config.
 */

/**
 * Pulled from toFileName in names from @nrwl/devkit.
 * Todo: Should refactor, not duplicate.
 */
export function toProjectName(
  fileName: string,
  nxJson: NxJsonConfiguration
): string {
  const directory = dirname(fileName);
  let { appsDir, libsDir } = nxJson?.workspaceLayout || {};
  appsDir ??= 'apps';
  libsDir ??= 'libs';
  const parts = directory.split(/[\/\\]/g);
  if ([appsDir, libsDir].includes(parts[0])) {
    parts.splice(0, 1);
  }
  return parts.join('-').toLowerCase();
}

let projectGlobCache: string[];
let projectGlobCacheKey: string;

export function getGlobPatternsFromPlugins(
  nxJson: NxJsonConfiguration,
  paths: string[],
  root = workspaceRoot
): string[] {
  const plugins = loadNxPlugins(nxJson?.plugins, paths, root);

  const patterns = [];
  for (const plugin of plugins) {
    if (!plugin.projectFilePatterns) {
      continue;
    }
    for (const filePattern of plugin.projectFilePatterns) {
      patterns.push('**/' + filePattern);
    }
  }

  return patterns;
}

/**
 * Get the package.json globs from package manager workspaces
 */
export function getGlobPatternsFromPackageManagerWorkspaces(
  root: string
): string[] {
  try {
    try {
      const obj = yaml.load(readFileSync(join(root, 'pnpm-workspace.yaml')));
      return normalizePatterns(obj.packages);
    } catch {
      const { workspaces } = readJsonFile<PackageJson>(
        join(root, 'package.json')
      );
      return normalizePatterns(
        Array.isArray(workspaces) ? workspaces : workspaces?.packages
      );
    }
  } catch {
    return ['**/package.json'];
  }
}

function normalizePatterns(patterns: string[]): string[] {
  if (patterns === undefined) return ['**/package.json'];
  return patterns.map((pattern) =>
    removeRelativePath(
      pattern.endsWith('/package.json') ? pattern : `${pattern}/package.json`
    )
  );
}

function removeRelativePath(pattern: string): string {
  return pattern.startsWith('./') ? pattern.substring(2) : pattern;
}

export function globForProjectFiles(
  root,
  nxJson?: NxJsonConfiguration,
  ignorePluginInference = false
) {
  // Deal w/ Caching
  const cacheKey = [root, ...(nxJson?.plugins || [])].join(',');
  if (
    process.env.NX_PROJECT_GLOB_CACHE !== 'false' &&
    projectGlobCache &&
    cacheKey === projectGlobCacheKey
  ) {
    return projectGlobCache;
  }
  projectGlobCacheKey = cacheKey;

  const globPatternsFromPackageManagerWorkspaces =
    getGlobPatternsFromPackageManagerWorkspaces(root);

  const globsToInclude = globPatternsFromPackageManagerWorkspaces.filter(
    (glob) => !glob.startsWith('!')
  );

  const globsToExclude = globPatternsFromPackageManagerWorkspaces
    .filter((glob) => glob.startsWith('!'))
    .map((glob) => glob.substring(1));

  const projectGlobPatterns: string[] = [
    'project.json',
    '**/project.json',
    ...globsToInclude,
  ];

  if (!ignorePluginInference) {
    projectGlobPatterns.push(
      ...getGlobPatternsFromPlugins(nxJson, [root], root)
    );
  }

  const combinedProjectGlobPattern = '{' + projectGlobPatterns.join(',') + '}';

  performance.mark('start-glob-for-projects');
  /**
   * This configures the files and directories which we always want to ignore as part of file watching
   * and which we know the location of statically (meaning irrespective of user configuration files).
   * This has the advantage of being ignored directly within globSync
   *
   * Other ignored entries will need to be determined dynamically by reading and evaluating the user's
   * .gitignore and .nxignore files below.
   */

  const ALWAYS_IGNORE = [
    '/node_modules',
    '**/node_modules',
    '/dist',
    ...globsToExclude,
  ];

  /**
   * TODO: This utility has been implemented multiple times across the Nx codebase,
   * discuss whether it should be moved to a shared location.
   */
  const ig = ignore();
  try {
    ig.add(readFileSync(`${root}/.gitignore`, 'utf-8'));
  } catch {}
  try {
    ig.add(readFileSync(`${root}/.nxignore`, 'utf-8'));
  } catch {}

  const globResults = globSync(combinedProjectGlobPattern, {
    ignore: ALWAYS_IGNORE,
    absolute: false,
    cwd: root,
    dot: true,
  });
  projectGlobCache = deduplicateProjectFiles(globResults, ig);
  performance.mark('finish-glob-for-projects');
  performance.measure(
    'glob-for-project-files',
    'start-glob-for-projects',
    'finish-glob-for-projects'
  );
  return projectGlobCache;
}

export function deduplicateProjectFiles(files: string[], ig?: Ignore) {
  const filtered = new Map();
  files.forEach((file) => {
    const projectFolder = dirname(file);
    const projectFile = basename(file);
    if (
      ig?.ignores(file) || // file is in .gitignore or .nxignore
      file === 'package.json' || // file is workspace root package json
      // project.json or equivallent inferred project file has been found
      (filtered.has(projectFolder) && projectFile !== 'project.json')
    ) {
      return;
    }

    filtered.set(projectFolder, projectFile);
  });
  return Array.from(filtered.entries()).map(([folder, file]) =>
    join(folder, file)
  );
}

function buildProjectConfigurationFromPackageJson(
  path: string,
  packageJson: { name: string },
  nxJson: NxJsonConfiguration
): ProjectConfiguration & { name: string } {
  const directory = dirname(path).split('\\').join('/');
  let name = packageJson.name ?? toProjectName(directory, nxJson);
  if (nxJson?.npmScope) {
    const npmPrefix = `@${nxJson.npmScope}/`;
    if (name.startsWith(npmPrefix)) {
      name = name.replace(npmPrefix, '');
    }
  }
  const projectType =
    nxJson?.workspaceLayout?.appsDir != nxJson?.workspaceLayout?.libsDir &&
    nxJson?.workspaceLayout?.appsDir &&
    directory.startsWith(nxJson.workspaceLayout.appsDir)
      ? 'application'
      : 'library';
  return {
    root: directory,
    sourceRoot: directory,
    name,
    projectType,
  };
}

export function inferProjectFromNonStandardFile(
  file: string,
  nxJson: NxJsonConfiguration
): ProjectConfiguration & { name: string } {
  const directory = dirname(file).split('\\').join('/');

  return {
    name: toProjectName(file, nxJson),
    root: directory,
  };
}

export function buildWorkspaceConfigurationFromGlobs(
  nxJson: NxJsonConfiguration,
  projectFiles: string[], // making this parameter allows devkit to pick up newly created projects
  readJson: (string) => any = readJsonFile // making this an arg allows us to reuse in devkit
): ProjectsConfigurations {
  const projects: Record<string, ProjectConfiguration> = {};

  for (const file of projectFiles) {
    const directory = dirname(file).split('\\').join('/');
    const fileName = basename(file);

    if (fileName === 'project.json') {
      //  Nx specific project configuration (`project.json` files) in the same
      // directory as a package.json should overwrite the inferred package.json
      // project configuration.
      const configuration = readJson(file);

      configuration.root = directory;

      let name = configuration.name;
      if (!configuration.name) {
        name = toProjectName(file, nxJson);
      }
      if (!projects[name]) {
        projects[name] = configuration;
      } else {
        logger.warn(
          `Skipping project found at ${directory} since project ${name} already exists at ${projects[name].root}! Specify a unique name for the project to allow Nx to differentiate between the two projects.`
        );
      }
    } else {
      // We can infer projects from package.json files,
      // if a package.json file is in a directory w/o a `project.json` file.
      // this results in targets being inferred by Nx from package scripts,
      // and the root / sourceRoot both being the directory.
      if (fileName === 'package.json') {
        const { name, ...config } = buildProjectConfigurationFromPackageJson(
          file,
          readJson(file),
          nxJson
        );
        if (!projects[name]) {
          projects[name] = config;
        } else {
          logger.warn(
            `Skipping project found at ${directory} since project ${name} already exists at ${projects[name].root}! Specify a unique name for the project to allow Nx to differentiate between the two projects.`
          );
        }
      } else {
        // This project was created from an nx plugin.
        // The only thing we know about the file is its location
        const { name, ...config } = inferProjectFromNonStandardFile(
          file,
          nxJson
        );
        if (!projects[name]) {
          projects[name] = config;
        } else {
          logger.error(
            `Skipping project inferred from ${file} since project ${name} already exists.`
          );
          throw new Error();
        }
      }
    }
  }

  return {
    version: 2,
    projects: projects,
  };
}

// we have to do it this way to preserve the order of properties
// not to screw up the formatting
export function renamePropertyWithStableKeys(
  obj: any,
  from: string,
  to: string
) {
  const copy = { ...obj };
  Object.keys(obj).forEach((k) => {
    delete obj[k];
  });
  Object.keys(copy).forEach((k) => {
    if (k === from) {
      obj[to] = copy[k];
    } else {
      obj[k] = copy[k];
    }
  });
}
