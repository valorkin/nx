import {
  checkFilesDoNotExist,
  checkFilesExist,
  cleanupProject,
  createFile,
  expectJestTestsToPass,
  newProject,
  readFile,
  readJson,
  runCLI,
  runCLIAsync,
  runCommandUntil,
  uniq,
  updateFile,
  updateJson,
  waitUntil,
} from '../../utils';

describe('js e2e', () => {
  let scope: string;

  beforeEach(() => {
    scope = newProject();
  });

  afterEach(() => cleanupProject());

  it('should create libs with npm scripts', () => {
    const npmScriptsLib = uniq('npmscriptslib');
    runCLI(`generate @nrwl/js:lib ${npmScriptsLib} --config=npm-scripts`);
    const libPackageJson = readJson(`libs/${npmScriptsLib}/package.json`);
    expect(libPackageJson.scripts.test).toBeDefined();
    expect(libPackageJson.scripts.build).toBeDefined();
    expect(runCLI(`test ${npmScriptsLib}`)).toContain('implement test');

    const tsconfig = readJson(`tsconfig.base.json`);
    expect(tsconfig.compilerOptions.paths).toEqual({
      [`@${scope}/${npmScriptsLib}`]: [`libs/${npmScriptsLib}/src/index.ts`],
    });
  }, 120000);

  it('should create libs with js executors (--compiler=tsc)', async () => {
    const lib = uniq('lib');
    runCLI(`generate @nrwl/js:lib ${lib} --buildable --compiler=tsc`);
    const libPackageJson = readJson(`libs/${lib}/package.json`);
    expect(libPackageJson.scripts).toBeUndefined();
    expect((await runCLIAsync(`test ${lib}`)).combinedOutput).toContain(
      'Ran all test suites'
    );

    const packageJson = readJson('package.json');
    const devPackageNames = Object.keys(packageJson.devDependencies);
    expect(devPackageNames).toContain('@nrwl/web');

    const babelRc = readJson(`libs/${lib}/.babelrc`);
    expect(babelRc.plugins).toBeUndefined();
    expect(babelRc.presets).toStrictEqual([
      ['@nrwl/web/babel', { useBuiltIns: 'usage' }],
    ]);

    expect(runCLI(`build ${lib}`)).toContain('Done compiling TypeScript files');
    checkFilesExist(
      `dist/libs/${lib}/README.md`,
      `dist/libs/${lib}/package.json`,
      `dist/libs/${lib}/src/index.js`,
      `dist/libs/${lib}/src/lib/${lib}.js`,
      `dist/libs/${lib}/src/index.d.ts`,
      `dist/libs/${lib}/src/lib/${lib}.d.ts`
    );

    updateJson(`libs/${lib}/project.json`, (json) => {
      json.targets.build.options.assets.push({
        input: `libs/${lib}/docs`,
        glob: '**/*.md',
        output: 'docs',
      });
      return json;
    });
    const libBuildProcess = await runCommandUntil(
      `build ${lib} --watch`,
      (output) => output.includes(`Watching for file changes`)
    );
    updateFile(`libs/${lib}/README.md`, `Hello, World!`);
    updateJson(`libs/${lib}/package.json`, (json) => {
      json.version = '999.9.9';
      return json;
    });
    updateFile(`libs/${lib}/docs/a/b/nested.md`, 'Nested File');
    await expect(
      waitUntil(() =>
        readFile(`dist/libs/${lib}/README.md`).includes(`Hello, World!`)
      )
    ).resolves.not.toThrow();
    await expect(
      waitUntil(() =>
        readFile(`dist/libs/${lib}/docs/a/b/nested.md`).includes(`Nested File`)
      )
    ).resolves.not.toThrow();
    await expect(
      waitUntil(() =>
        readFile(`dist/libs/${lib}/package.json`).includes(
          `"version": "999.9.9"`
        )
      )
    ).resolves.not.toThrow();
    libBuildProcess.kill();

    const parentLib = uniq('parentlib');
    runCLI(`generate @nrwl/js:lib ${parentLib} --buildable --compiler=tsc`);
    const parentLibPackageJson = readJson(`libs/${parentLib}/package.json`);
    expect(parentLibPackageJson.scripts).toBeUndefined();
    expect((await runCLIAsync(`test ${parentLib}`)).combinedOutput).toContain(
      'Ran all test suites'
    );

    expect(runCLI(`build ${parentLib}`)).toContain(
      'Done compiling TypeScript files'
    );
    checkFilesExist(
      `dist/libs/${parentLib}/package.json`,
      `dist/libs/${parentLib}/src/index.js`,
      `dist/libs/${parentLib}/src/lib/${parentLib}.js`,
      `dist/libs/${parentLib}/src/index.d.ts`,
      `dist/libs/${parentLib}/src/lib/${parentLib}.d.ts`
    );

    const tsconfig = readJson(`tsconfig.base.json`);
    expect(tsconfig.compilerOptions.paths).toEqual({
      [`@${scope}/${lib}`]: [`libs/${lib}/src/index.ts`],
      [`@${scope}/${parentLib}`]: [`libs/${parentLib}/src/index.ts`],
    });

    updateFile(`libs/${parentLib}/src/index.ts`, () => {
      return `
        import { ${lib} } from '@${scope}/${lib}'
        export * from './lib/${parentLib}';
      `;
    });

    const output = runCLI(`build ${parentLib}`);
    expect(output).toContain('1 task(s) it depends on');
    expect(output).toContain('Done compiling TypeScript files');

    updateJson(`libs/${lib}/tsconfig.json`, (json) => {
      json.compilerOptions = { ...json.compilerOptions, importHelpers: true };
      return json;
    });

    runCLI(`build ${lib}`);

    const rootPackageJson = readJson(`package.json`);

    expect(readJson(`dist/libs/${lib}/package.json`)).toHaveProperty(
      'peerDependencies.tslib',
      rootPackageJson.dependencies.tslib
    );

    updateJson(`libs/${lib}/tsconfig.json`, (json) => {
      json.compilerOptions = { ...json.compilerOptions, importHelpers: false };
      return json;
    });

    runCLI(`build ${lib}`);

    expect(readJson(`dist/libs/${lib}/package.json`)).not.toHaveProperty(
      'peerDependencies.tslib'
    );
  }, 120000);

  it('should create libs with js executors (--compiler=swc)', async () => {
    const lib = uniq('lib');
    runCLI(`generate @nrwl/js:lib ${lib} --buildable --compiler=swc`);
    const libPackageJson = readJson(`libs/${lib}/package.json`);
    expect(libPackageJson.scripts).toBeUndefined();
    expect((await runCLIAsync(`test ${lib}`)).combinedOutput).toContain(
      'Ran all test suites'
    );

    expect(runCLI(`build ${lib}`)).toContain(
      'Successfully compiled: 2 files with swc'
    );
    checkFilesExist(
      `dist/libs/${lib}/package.json`,
      `dist/libs/${lib}/src/index.js`,
      `dist/libs/${lib}/src/lib/${lib}.js`,
      `dist/libs/${lib}/src/index.d.ts`,
      `dist/libs/${lib}/src/lib/${lib}.d.ts`
    );

    checkFilesDoNotExist(`libs/${lib}/.babelrc`);

    const parentLib = uniq('parentlib');
    runCLI(`generate @nrwl/js:lib ${parentLib} --buildable --compiler=swc`);
    const parentLibPackageJson = readJson(`libs/${parentLib}/package.json`);
    expect(parentLibPackageJson.scripts).toBeUndefined();
    expect((await runCLIAsync(`test ${parentLib}`)).combinedOutput).toContain(
      'Ran all test suites'
    );

    expect(runCLI(`build ${parentLib}`)).toContain(
      'Successfully compiled: 2 files with swc'
    );
    checkFilesExist(
      `dist/libs/${parentLib}/package.json`,
      `dist/libs/${parentLib}/src/index.js`,
      `dist/libs/${parentLib}/src/lib/${parentLib}.js`,
      `dist/libs/${parentLib}/src/index.d.ts`,
      `dist/libs/${parentLib}/src/lib/${parentLib}.d.ts`
    );

    const tsconfig = readJson(`tsconfig.base.json`);
    expect(tsconfig.compilerOptions.paths).toEqual({
      [`@${scope}/${lib}`]: [`libs/${lib}/src/index.ts`],
      [`@${scope}/${parentLib}`]: [`libs/${parentLib}/src/index.ts`],
    });

    updateFile(`libs/${parentLib}/src/index.ts`, () => {
      return `
        import { ${lib} } from '@${scope}/${lib}';
        export * from './lib/${parentLib}';
      `;
    });

    const output = runCLI(`build ${parentLib}`);
    expect(output).toContain('1 task(s) it depends on');
    expect(output).toContain('Successfully compiled: 2 files with swc');

    updateJson(`libs/${lib}/.lib.swcrc`, (json) => {
      json.jsc.externalHelpers = true;
      return json;
    });

    runCLI(`build ${lib}`);

    const rootPackageJson = readJson(`package.json`);

    expect(readJson(`dist/libs/${lib}/package.json`)).toHaveProperty(
      'peerDependencies.@swc/helpers',
      rootPackageJson.dependencies['@swc/helpers']
    );

    updateJson(`libs/${lib}/.lib.swcrc`, (json) => {
      json.jsc.externalHelpers = false;
      return json;
    });

    runCLI(`build ${lib}`);

    expect(readJson(`dist/libs/${lib}/package.json`)).not.toHaveProperty(
      'peerDependencies.@swc/helpers'
    );
  }, 120000);

  it('should allow wildcard ts path alias', async () => {
    const base = uniq('base');
    runCLI(`generate @nrwl/js:lib ${base} --buildable`);

    const lib = uniq('lib');
    runCLI(`generate @nrwl/js:lib ${lib} --buildable`);

    updateFile(`libs/${base}/src/index.ts`, () => {
      return `
        import { ${lib} } from '@${scope}/${lib}'
        export * from './lib/${base}';

        ${lib}();
      `;
    });

    expect(runCLI(`build ${base}`)).toContain(
      'Done compiling TypeScript files'
    );

    updateJson('tsconfig.base.json', (json) => {
      json['compilerOptions']['paths'][`@${scope}/${lib}/*`] = [
        `libs/${lib}/src/*`,
      ];
      return json;
    });

    createFile(
      `libs/${lib}/src/${lib}.ts`,
      `
export function ${lib}Wildcard() {
  return '${lib}-wildcard';
};
    `
    );

    updateFile(`libs/${base}/src/index.ts`, () => {
      return `
        import { ${lib} } from '@${scope}/${lib}';
        import { ${lib}Wildcard } from '@${scope}/${lib}/src/${lib}';
        export * from './lib/${base}';

        ${lib}();
        ${lib}Wildcard();
      `;
    });

    expect(runCLI(`build ${base}`)).toContain(
      'Done compiling TypeScript files'
    );
  }, 120000);

  it('should not create a `.babelrc` file when creating libs with js executors (--compiler=tsc)', () => {
    const lib = uniq('lib');
    runCLI(
      `generate @nrwl/js:lib ${lib} --compiler=tsc --includeBabelRc=false`
    );

    checkFilesDoNotExist(`libs/${lib}/.babelrc`);
  });

  it('should run default jest tests', async () => {
    await expectJestTestsToPass('@nrwl/js:lib');
  }, 100000);
});
