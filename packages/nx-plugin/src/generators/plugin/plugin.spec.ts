import {
  getProjects,
  joinPathFragments,
  readJson,
  readProjectConfiguration,
  Tree,
} from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Linter } from '@nrwl/linter';
import { pluginGenerator } from './plugin';
import { Schema } from './schema';

const getSchema: (overrides?: Partial<Schema>) => Schema = (
  overrides = {}
) => ({
  name: 'my-plugin',
  compiler: 'tsc',
  skipTsConfig: false,
  skipFormat: false,
  skipLintChecks: false,
  linter: Linter.EsLint,
  unitTestRunner: 'jest',
  ...overrides,
});

describe('NxPlugin Plugin Generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should update the workspace.json file', async () => {
    await pluginGenerator(tree, getSchema());
    const project = readProjectConfiguration(tree, 'my-plugin');
    expect(project.root).toEqual('libs/my-plugin');
    expect(project.targets.build).toEqual({
      executor: '@nrwl/js:tsc',
      outputs: ['{options.outputPath}'],
      options: {
        outputPath: 'dist/libs/my-plugin',
        tsConfig: 'libs/my-plugin/tsconfig.lib.json',
        main: 'libs/my-plugin/src/index.ts',
        assets: [
          'libs/my-plugin/*.md',
          {
            input: './libs/my-plugin/src',
            glob: '**/!(*.ts)',
            output: './src',
          },
          {
            input: './libs/my-plugin/src',
            glob: '**/*.d.ts',
            output: './src',
          },
          {
            input: './libs/my-plugin',
            glob: 'generators.json',
            output: '.',
          },
          {
            input: './libs/my-plugin',
            glob: 'executors.json',
            output: '.',
          },
        ],
      },
    });
    expect(project.targets.lint).toEqual({
      executor: '@nrwl/linter:eslint',
      outputs: ['{options.outputFile}'],
      options: {
        lintFilePatterns: expect.arrayContaining([
          'libs/my-plugin/**/*.ts',
          'libs/my-plugin/generators.json',
          'libs/my-plugin/package.json',
          'libs/my-plugin/executors.json',
        ]),
      },
    });
    expect(project.targets.test).toEqual({
      executor: '@nrwl/jest:jest',
      outputs: ['coverage/libs/my-plugin'],
      options: {
        jestConfig: 'libs/my-plugin/jest.config.ts',
        passWithNoTests: true,
      },
    });
  });

  it('should place the plugin in a directory', async () => {
    await pluginGenerator(
      tree,
      getSchema({
        name: 'myPlugin',
        directory: 'plugins',
      })
    );
    const project = readProjectConfiguration(tree, 'plugins-my-plugin');
    const projectE2e = readProjectConfiguration(tree, 'plugins-my-plugin-e2e');
    expect(project.root).toEqual('libs/plugins/my-plugin');
    expect(projectE2e.root).toEqual('apps/plugins/my-plugin-e2e');
  });

  it('should create schematic and builder files', async () => {
    await pluginGenerator(tree, getSchema({ name: 'myPlugin' }));

    [
      'libs/my-plugin/project.json',
      'libs/my-plugin/generators.json',
      'libs/my-plugin/executors.json',
      'libs/my-plugin/src/generators/my-plugin/schema.d.ts',
      'libs/my-plugin/src/generators/my-plugin/generator.ts',
      'libs/my-plugin/src/generators/my-plugin/generator.spec.ts',
      'libs/my-plugin/src/generators/my-plugin/schema.json',
      'libs/my-plugin/src/generators/my-plugin/schema.d.ts',
      'libs/my-plugin/src/generators/my-plugin/files/src/index.ts__template__',
      'libs/my-plugin/src/executors/build/executor.ts',
      'libs/my-plugin/src/executors/build/executor.spec.ts',
      'libs/my-plugin/src/executors/build/schema.json',
      'libs/my-plugin/src/executors/build/schema.d.ts',
    ].forEach((path) => expect(tree.exists(path)).toBeTruthy());

    expect(
      tree.read(
        'libs/my-plugin/src/generators/my-plugin/files/src/index.ts__template__',
        'utf-8'
      )
    ).toContain('const variable = "<%= projectName %>";');
  });

  it('should not create generator and executor files for minimal setups', async () => {
    await pluginGenerator(tree, getSchema({ name: 'myPlugin', minimal: true }));

    [
      'libs/my-plugin/project.json',
      'libs/my-plugin/generators.json',
      'libs/my-plugin/executors.json',
    ].forEach((path) => expect(tree.exists(path)).toBeTruthy());

    [
      'libs/my-plugin/src/generators/my-plugin/schema.d.ts',
      'libs/my-plugin/src/generators/my-plugin/generator.ts',
      'libs/my-plugin/src/generators/my-plugin/generator.spec.ts',
      'libs/my-plugin/src/generators/my-plugin/schema.json',
      'libs/my-plugin/src/generators/my-plugin/schema.d.ts',
      'libs/my-plugin/src/generators/my-plugin/files/src/index.ts__template__',
      'libs/my-plugin/src/executors/build/executor.ts',
      'libs/my-plugin/src/executors/build/executor.spec.ts',
      'libs/my-plugin/src/executors/build/schema.json',
      'libs/my-plugin/src/executors/build/schema.d.ts',
    ].forEach((path) => expect(tree.exists(path)).toBeFalsy());

    expect(tree.read('libs/my-plugin/generators.json', 'utf-8'))
      .toMatchInlineSnapshot(`
      "{
        \\"$schema\\": \\"http://json-schema.org/schema\\",
        \\"name\\": \\"my-plugin\\",
        \\"version\\": \\"0.0.1\\",
        \\"generators\\": {}
      }
      "
    `);
    expect(tree.read('libs/my-plugin/executors.json', 'utf-8'))
      .toMatchInlineSnapshot(`
      "{
        \\"$schema\\": \\"http://json-schema.org/schema\\",
        \\"executors\\": {}
      }
      "
    `);
  });

  describe('--unitTestRunner', () => {
    describe('none', () => {
      it('should not generate test files', async () => {
        await pluginGenerator(
          tree,
          getSchema({
            name: 'myPlugin',
            unitTestRunner: 'none',
          })
        );

        [
          'libs/my-plugin/src/generators/my-plugin/generator.ts',
          'libs/my-plugin/src/executors/build/executor.ts',
        ].forEach((path) => expect(tree.exists(path)).toBeTruthy());

        [
          'libs/my-plugin/src/generators/my-plugin/generator.spec.ts',
          'libs/my-plugin/src/executors/build/executor.spec.ts',
        ].forEach((path) => expect(tree.exists(path)).toBeFalsy());
      });
    });
  });

  describe('--compiler', () => {
    it('should specify tsc as compiler', async () => {
      await pluginGenerator(
        tree,
        getSchema({
          compiler: 'tsc',
        })
      );

      const { build } = readProjectConfiguration(tree, 'my-plugin').targets;

      expect(build.executor).toEqual('@nrwl/js:tsc');
    });

    it('should specify swc as compiler', async () => {
      await pluginGenerator(
        tree,
        getSchema({
          compiler: 'swc',
        })
      );

      const { build } = readProjectConfiguration(tree, 'my-plugin').targets;

      expect(build.executor).toEqual('@nrwl/js:swc');
    });
  });

  describe('--importPath', () => {
    it('should use the workspace npmScope by default for the package.json', async () => {
      await pluginGenerator(tree, getSchema());

      const { root } = readProjectConfiguration(tree, 'my-plugin');
      const { name } = readJson<{ name: string }>(
        tree,
        joinPathFragments(root, 'package.json')
      );

      expect(name).toEqual('@proj/my-plugin');
    });

    it('should correctly setup npmScope less workspaces', async () => {
      // remove the npmScope from nx.json
      const nxJson = JSON.parse(tree.read('nx.json')!.toString());
      delete nxJson.npmScope;
      tree.write('nx.json', JSON.stringify(nxJson));

      await pluginGenerator(tree, getSchema());

      const { root } = readProjectConfiguration(tree, 'my-plugin');
      const { name } = readJson<{ name: string }>(
        tree,
        joinPathFragments(root, 'package.json')
      );

      expect(name).toEqual('my-plugin');
    });

    it('should use importPath as the package.json name', async () => {
      await pluginGenerator(
        tree,
        getSchema({ importPath: '@my-company/my-plugin' })
      );

      const { root } = readProjectConfiguration(tree, 'my-plugin');
      const { name } = readJson<{ name: string }>(
        tree,
        joinPathFragments(root, 'package.json')
      );

      expect(name).toEqual('@my-company/my-plugin');
    });
  });

  describe('--e2eTestRunner', () => {
    it('should allow the e2e project to be skipped', async () => {
      await pluginGenerator(tree, getSchema({ e2eTestRunner: 'none' }));
      const projects = getProjects(tree);
      expect(projects.has('plugins-my-plugin-e2e')).toBe(false);
    });
  });
});
