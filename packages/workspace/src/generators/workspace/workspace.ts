import {
  generateFiles,
  Tree,
  updateJson,
  convertNxGenerator,
  names,
  writeJson,
  formatFiles,
  getPackageManagerVersion,
  PackageManager,
  NxJsonConfiguration,
} from '@nrwl/devkit';
import { Schema } from './schema';
import {
  angularCliVersion,
  nxVersion,
  prettierVersion,
  typescriptVersion,
} from '../../utils/versions';
import { readFileSync } from 'fs';
import { join, join as pathJoin } from 'path';
import { reformattedWorkspaceJsonOrNull } from 'nx/src/config/workspaces';
import { Preset } from '../utils/presets';
import { deduceDefaultBase } from '../../utilities/default-base';

export const DEFAULT_NRWL_PRETTIER_CONFIG = {
  singleQuote: true,
};

function decorateAngularClI(host: Tree, options: Schema) {
  const decorateCli = readFileSync(
    pathJoin(__dirname as any, '..', 'utils', 'decorate-angular-cli.js__tmpl__')
  ).toString();
  host.write(join(options.directory, 'decorate-angular-cli.js'), decorateCli);
}

function setPresetProperty(tree: Tree, options: Schema) {
  updateJson(tree, join(options.directory, 'nx.json'), (json) => {
    if (options.preset === Preset.Core || options.preset === Preset.NPM) {
      addPropertyWithStableKeys(json, 'extends', 'nx/presets/npm.json');
      delete json.implicitDependencies;
      delete json.targetDefaults;
      delete json.targetDependencies;
      delete json.workspaceLayout;
    }
    return json;
  });
}

function createAppsAndLibsFolders(host: Tree, options: Schema) {
  if (
    options.preset === Preset.Core ||
    options.preset === Preset.TS ||
    options.preset === Preset.NPM
  ) {
    host.write(join(options.directory, 'packages/.gitkeep'), '');
  } else {
    host.write(join(options.directory, 'apps/.gitkeep'), '');
    host.write(join(options.directory, 'libs/.gitkeep'), '');
  }
}

function createNxJson(
  host: Tree,
  { directory, npmScope, cli, packageManager, defaultBase, preset }: Schema
) {
  const nxJson: NxJsonConfiguration & { $schema: string } = {
    $schema: './node_modules/nx/schemas/nx-schema.json',
    npmScope: npmScope,
    affected: {
      defaultBase,
    },
    tasksRunnerOptions: {
      default: {
        runner: 'nx/tasks-runners/default',
        options: {
          cacheableOperations: ['build', 'lint', 'test', 'e2e'],
        },
      },
    },
  };

  nxJson.targetDefaults = {
    build: {
      dependsOn: ['^build'],
    },
  };

  if (
    preset !== Preset.Core &&
    preset !== Preset.NPM &&
    preset !== Preset.Empty
  ) {
    nxJson.namedInputs = {
      default: ['{projectRoot}/**/*', 'sharedGlobals'],
      production: ['default'],
      sharedGlobals: [],
    };
    nxJson.targetDefaults.build.inputs = ['production', '^production'];
  }

  if (packageManager && cli === 'angular') {
    nxJson.cli = {
      packageManager: packageManager,
    };
  }

  writeJson<NxJsonConfiguration>(host, join(directory, 'nx.json'), nxJson);
}

function createFiles(host: Tree, options: Schema) {
  const formattedNames = names(options.name);
  generateFiles(host, pathJoin(__dirname, './files'), options.directory, {
    formattedNames,
    dot: '.',
    tmpl: '',
    workspaceFile: options.cli === 'angular' ? 'angular' : 'workspace',
    cliCommand: options.cli === 'angular' ? 'ng' : 'nx',
    nxCli: false,
    typescriptVersion,
    prettierVersion,
    // angular cli is used only when workspace schematics is added to angular cli
    angularCliVersion,
    ...(options as object),
    nxVersion,
    packageManager: options.packageManager,
  });
}

function createPrettierrc(host: Tree, options: Schema) {
  writeJson(
    host,
    join(options.directory, '.prettierrc'),
    DEFAULT_NRWL_PRETTIER_CONFIG
  );
}

// ensure that pnpm install add all the missing peer deps
function createNpmrc(host: Tree, options: Schema) {
  host.write(
    join(options.directory, '.npmrc'),
    'strict-peer-dependencies=false\nauto-install-peers=true\n'
  );
}

// ensure that yarn (berry) install uses classic node linker
function createYarnrcYml(host: Tree, options: Schema) {
  host.write(
    join(options.directory, '.yarnrc.yml'),
    'nodeLinker: node-modules\n'
  );
}

function addNpmScripts(host: Tree, options: Schema) {
  if (options.cli === 'angular') {
    updateJson(host, join(options.directory, 'package.json'), (json) => {
      Object.assign(json.scripts, {
        ng: 'nx',
        postinstall: 'node ./decorate-angular-cli.js',
      });
      return json;
    });
  }

  if (
    options.preset !== Preset.TS &&
    options.preset !== Preset.Core &&
    options.preset !== Preset.NPM
  ) {
    updateJson(host, join(options.directory, 'package.json'), (json) => {
      Object.assign(json.scripts, {
        start: 'nx serve',
        build: 'nx build',
        test: 'nx test',
      });
      return json;
    });
  }
}

export async function workspaceGenerator(host: Tree, options: Schema) {
  if (!options.name) {
    throw new Error(`Invalid options, "name" is required.`);
  }
  options = normalizeOptions(options);
  createFiles(host, options);
  createNxJson(host, options);
  createPrettierrc(host, options);
  if (options.cli === 'angular') {
    decorateAngularClI(host, options);
  }
  const [packageMajor] = getPackageManagerVersion(
    options.packageManager as PackageManager
  ).split('.');
  if (options.packageManager === 'pnpm' && +packageMajor >= 7) {
    createNpmrc(host, options);
  } else if (options.packageManager === 'yarn' && +packageMajor >= 2) {
    createYarnrcYml(host, options);
  }
  setPresetProperty(host, options);
  addNpmScripts(host, options);
  createAppsAndLibsFolders(host, options);

  await formatFiles(host);
}

export const workspaceSchematic = convertNxGenerator(workspaceGenerator);

function addPropertyWithStableKeys(obj: any, key: string, value: string) {
  const copy = { ...obj };
  Object.keys(obj).forEach((k) => {
    delete obj[k];
  });
  obj[key] = value;
  Object.keys(copy).forEach((k) => {
    obj[k] = copy[k];
  });
}

function normalizeOptions(options: Schema) {
  let defaultBase = options.defaultBase || deduceDefaultBase();
  return {
    npmScope: options.name,
    ...options,
    defaultBase,
  };
}
