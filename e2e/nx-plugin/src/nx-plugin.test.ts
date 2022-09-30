import { ProjectConfiguration } from '@nrwl/devkit';
import {
  checkFilesExist,
  expectTestsPass,
  isNotWindows,
  killPorts,
  newProject,
  readJson,
  readProjectConfig,
  runCLI,
  runCLIAsync,
  uniq,
  updateFile,
  createFile,
  readFile,
  removeFile,
  cleanupProject,
} from '@nrwl/e2e/utils';

import { ASYNC_GENERATOR_EXECUTOR_CONTENTS } from './nx-plugin.fixtures';

describe('Nx Plugin', () => {
  let npmScope: string;

  beforeAll(() => {
    npmScope = newProject();
  });

  afterAll(() => cleanupProject());

  it('should be able to generate a Nx Plugin ', async () => {
    const plugin = uniq('plugin');

    runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);
    const lintResults = runCLI(`lint ${plugin}`);
    expect(lintResults).toContain('All files pass linting.');

    expectTestsPass(await runCLIAsync(`test ${plugin}`));

    const buildResults = runCLI(`build ${plugin}`);
    expect(buildResults).toContain('Done compiling TypeScript files');
    checkFilesExist(
      `dist/libs/${plugin}/package.json`,
      `dist/libs/${plugin}/generators.json`,
      `dist/libs/${plugin}/executors.json`,
      `dist/libs/${plugin}/src/index.js`,
      `dist/libs/${plugin}/src/generators/${plugin}/schema.json`,
      `dist/libs/${plugin}/src/generators/${plugin}/schema.d.ts`,
      `dist/libs/${plugin}/src/generators/${plugin}/generator.js`,
      `dist/libs/${plugin}/src/generators/${plugin}/files/src/index.ts__template__`,
      `dist/libs/${plugin}/src/executors/build/executor.js`,
      `dist/libs/${plugin}/src/executors/build/schema.d.ts`,
      `dist/libs/${plugin}/src/executors/build/schema.json`
    );
    const project = readJson(`libs/${plugin}/project.json`);
    expect(project).toMatchObject({
      tags: [],
    });
    const e2eProject = readJson(`apps/${plugin}-e2e/project.json`);

    expect(e2eProject).toMatchObject({
      tags: [],
      implicitDependencies: [`${plugin}`],
    });
  }, 90000);

  // the test invoke ensureNxProject, which points to @nrwl/workspace collection
  // which walks up the directory to find it in the next repo itself, so it
  // doesn't use the collection we are building
  // we should change it to point to the right collection using relative path
  // TODO: Re-enable this to work with pnpm
  xit(`should run the plugin's e2e tests`, async () => {
    const plugin = uniq('plugin-name');
    runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);

    if (isNotWindows()) {
      const e2eResults = runCLI(`e2e ${plugin}-e2e`);
      expect(e2eResults).toContain('Successfully ran target e2e');
      expect(await killPorts()).toBeTruthy();
    }
  }, 250000);

  it('should be able to generate a migration', async () => {
    const plugin = uniq('plugin');
    const version = '1.0.0';

    runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);
    runCLI(
      `generate @nrwl/nx-plugin:migration --project=${plugin} --packageVersion=${version} --packageJsonUpdates=false`
    );

    const lintResults = runCLI(`lint ${plugin}`);
    expect(lintResults).toContain('All files pass linting.');

    expectTestsPass(await runCLIAsync(`test ${plugin}`));

    const buildResults = runCLI(`build ${plugin}`);
    expect(buildResults).toContain('Done compiling TypeScript files');
    checkFilesExist(
      `dist/libs/${plugin}/src/migrations/update-${version}/update-${version}.js`,
      `libs/${plugin}/src/migrations/update-${version}/update-${version}.ts`
    );
    const migrationsJson = readJson(`libs/${plugin}/migrations.json`);
    expect(migrationsJson).toMatchObject({
      generators: expect.objectContaining({
        [`update-${version}`]: {
          version,
          description: `update-${version}`,
          cli: `nx`,
          implementation: `./src/migrations/update-${version}/update-${version}`,
        },
      }),
    });
  }, 90000);

  it('should be able to generate a generator', async () => {
    const plugin = uniq('plugin');
    const generator = uniq('generator');

    runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);
    runCLI(
      `generate @nrwl/nx-plugin:generator ${generator} --project=${plugin}`
    );

    const lintResults = runCLI(`lint ${plugin}`);
    expect(lintResults).toContain('All files pass linting.');

    expectTestsPass(await runCLIAsync(`test ${plugin}`));

    const buildResults = runCLI(`build ${plugin}`);
    expect(buildResults).toContain('Done compiling TypeScript files');
    checkFilesExist(
      `libs/${plugin}/src/generators/${generator}/schema.d.ts`,
      `libs/${plugin}/src/generators/${generator}/schema.json`,
      `libs/${plugin}/src/generators/${generator}/generator.ts`,
      `libs/${plugin}/src/generators/${generator}/generator.spec.ts`,
      `dist/libs/${plugin}/src/generators/${generator}/schema.d.ts`,
      `dist/libs/${plugin}/src/generators/${generator}/schema.json`,
      `dist/libs/${plugin}/src/generators/${generator}/generator.js`
    );
    const generatorJson = readJson(`libs/${plugin}/generators.json`);
    expect(generatorJson).toMatchObject({
      generators: expect.objectContaining({
        [generator]: {
          factory: `./src/generators/${generator}/generator`,
          schema: `./src/generators/${generator}/schema.json`,
          description: `${generator} generator`,
        },
      }),
    });
  }, 90000);

  it('should be able to generate an executor', async () => {
    const plugin = uniq('plugin');
    const executor = uniq('executor');

    runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);
    runCLI(
      `generate @nrwl/nx-plugin:executor ${executor} --project=${plugin} --includeHasher`
    );

    const lintResults = runCLI(`lint ${plugin}`);
    expect(lintResults).toContain('All files pass linting.');

    expectTestsPass(await runCLIAsync(`test ${plugin}`));

    const buildResults = runCLI(`build ${plugin}`);
    expect(buildResults).toContain('Done compiling TypeScript files');
    checkFilesExist(
      `libs/${plugin}/src/executors/${executor}/schema.d.ts`,
      `libs/${plugin}/src/executors/${executor}/schema.json`,
      `libs/${plugin}/src/executors/${executor}/executor.ts`,
      `libs/${plugin}/src/executors/${executor}/hasher.ts`,
      `libs/${plugin}/src/executors/${executor}/executor.spec.ts`,
      `dist/libs/${plugin}/src/executors/${executor}/schema.d.ts`,
      `dist/libs/${plugin}/src/executors/${executor}/schema.json`,
      `dist/libs/${plugin}/src/executors/${executor}/executor.js`,
      `dist/libs/${plugin}/src/executors/${executor}/hasher.js`
    );
    const executorsJson = readJson(`libs/${plugin}/executors.json`);
    expect(executorsJson).toMatchObject({
      executors: expect.objectContaining({
        [executor]: {
          implementation: `./src/executors/${executor}/executor`,
          hasher: `./src/executors/${executor}/hasher`,
          schema: `./src/executors/${executor}/schema.json`,
          description: `${executor} executor`,
        },
      }),
    });
  }, 90000);

  it('should catch invalid implementations, schemas, and version in lint', async () => {
    const plugin = uniq('plugin');
    const goodGenerator = uniq('good-generator');
    const goodExecutor = uniq('good-executor');
    const goodMigration = uniq('good-migration');
    const badMigrationVersion = uniq('bad-version');
    const missingMigrationVersion = uniq('missing-version');

    // Generating the plugin results in a generator also called {plugin},
    // as well as an executor called "build"
    runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);

    runCLI(
      `generate @nrwl/nx-plugin:generator ${goodGenerator} --project=${plugin}`
    );

    runCLI(
      `generate @nrwl/nx-plugin:executor ${goodExecutor} --project=${plugin}`
    );

    runCLI(
      `generate @nrwl/nx-plugin:migration ${badMigrationVersion} --project=${plugin} --packageVersion="invalid"`
    );

    runCLI(
      `generate @nrwl/nx-plugin:migration ${missingMigrationVersion} --project=${plugin} --packageVersion="0.1.0"`
    );

    runCLI(
      `generate @nrwl/nx-plugin:migration ${goodMigration} --project=${plugin} --packageVersion="0.1.0"`
    );

    updateFile(`libs/${plugin}/generators.json`, (f) => {
      const json = JSON.parse(f);
      // @proj/plugin:plugin has an invalid implementation path
      json.generators[plugin].factory = `./generators/${plugin}/bad-path`;
      // @proj/plugin:non-existant has a missing implementation path amd schema
      json.generators['non-existant-generator'] = {};
      return JSON.stringify(json);
    });

    updateFile(`libs/${plugin}/executors.json`, (f) => {
      const json = JSON.parse(f);
      // @proj/plugin:build has an invalid implementation path
      json.executors['build'].implementation = './executors/build/bad-path';
      // @proj/plugin:non-existant has a missing implementation path amd schema
      json.executors['non-existant-executor'] = {};
      return JSON.stringify(json);
    });

    updateFile(`libs/${plugin}/migrations.json`, (f) => {
      const json = JSON.parse(f);
      delete json.generators[missingMigrationVersion].version;
      return JSON.stringify(json);
    });

    const results = runCLI(`lint ${plugin}`, { silenceError: true });
    expect(results).toContain(
      `${plugin}: Implementation path should point to a valid file`
    );
    expect(results).toContain(
      `non-existant-generator: Missing required property - \`schema\``
    );
    expect(results).toContain(
      `non-existant-generator: Missing required property - \`implementation\``
    );
    expect(results).not.toContain(goodGenerator);

    expect(results).toContain(
      `build: Implementation path should point to a valid file`
    );
    expect(results).toContain(
      `non-existant-executor: Missing required property - \`schema\``
    );
    expect(results).toContain(
      `non-existant-executor: Missing required property - \`implementation\``
    );
    expect(results).not.toContain(goodExecutor);

    expect(results).toContain(
      `${missingMigrationVersion}: Missing required property - \`version\``
    );
    expect(results).toContain(
      `${badMigrationVersion}: Version should be a valid semver`
    );
    expect(results).not.toContain(goodMigration);
  });

  describe('local plugins', () => {
    let plugin: string;
    beforeEach(() => {
      plugin = uniq('plugin');
      runCLI(`generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint`);
    });

    it('should be able to infer projects and targets', async () => {
      // Setup project inference + target inference
      updateFile(
        `libs/${plugin}/src/index.ts`,
        `import {basename} from 'path'

  export function registerProjectTargets(f) {
    if (basename(f) === 'my-project-file') {
      return {
        build: {
          executor: "nx:run-commands",
          options: {
            command: "echo 'custom registered target'"
          }
        }
      }
    }
  }

  export const projectFilePatterns = ['my-project-file'];
  `
      );

      // Register plugin in nx.json (required for inference)
      updateFile(`nx.json`, (nxJson) => {
        const nx = JSON.parse(nxJson);
        nx.plugins = [`@${npmScope}/${plugin}`];
        return JSON.stringify(nx, null, 2);
      });

      // Create project that should be inferred by Nx
      const inferredProject = uniq('inferred');
      createFile(`libs/${inferredProject}/my-project-file`);

      // Attempt to use inferred project w/ Nx
      expect(runCLI(`build ${inferredProject}`)).toContain(
        'custom registered target'
      );
    });

    it('should be able to use local generators and executors', async () => {
      const generator = uniq('generator');
      const executor = uniq('executor');
      const generatedProject = uniq('project');

      runCLI(
        `generate @nrwl/nx-plugin:generator ${generator} --project=${plugin}`
      );

      runCLI(
        `generate @nrwl/nx-plugin:executor ${executor} --project=${plugin}`
      );

      updateFile(
        `libs/${plugin}/src/executors/${executor}/executor.ts`,
        ASYNC_GENERATOR_EXECUTOR_CONTENTS
      );

      runCLI(
        `generate @${npmScope}/${plugin}:${generator} --name ${generatedProject}`
      );

      updateFile(`libs/${generatedProject}/project.json`, (f) => {
        const project: ProjectConfiguration = JSON.parse(f);
        project.targets['execute'] = {
          executor: `@${npmScope}/${plugin}:${executor}`,
        };
        return JSON.stringify(project, null, 2);
      });

      expect(() => checkFilesExist(`libs/${generatedProject}`)).not.toThrow();
      expect(() => runCLI(`execute ${generatedProject}`)).not.toThrow();
    });
  });

  describe('--directory', () => {
    it('should create a plugin in the specified directory', () => {
      const plugin = uniq('plugin');
      runCLI(
        `generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint --directory subdir `
      );
      checkFilesExist(`libs/subdir/${plugin}/package.json`);
      const pluginProject = readProjectConfig(`subdir-${plugin}`);
      const pluginE2EProject = readProjectConfig(`subdir-${plugin}-e2e`);
      expect(pluginProject.targets).toBeDefined();
      expect(pluginE2EProject).toBeTruthy();
    }, 90000);
  });
  describe('--tags', () => {
    it('should add tags to workspace.json', async () => {
      const plugin = uniq('plugin');
      runCLI(
        `generate @nrwl/nx-plugin:plugin ${plugin} --linter=eslint --tags=e2etag,e2ePackage `
      );
      const pluginProject = readProjectConfig(plugin);
      expect(pluginProject.tags).toEqual(['e2etag', 'e2ePackage']);
    }, 90000);
  });
});
