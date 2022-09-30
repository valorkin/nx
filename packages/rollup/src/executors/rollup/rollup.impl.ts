import 'dotenv/config';
import * as ts from 'typescript';
import * as rollup from 'rollup';
import * as peerDepsExternal from 'rollup-plugin-peer-deps-external';
import { getBabelInputPlugin } from '@rollup/plugin-babel';
import { dirname, join, parse } from 'path';
import { from, Observable, of } from 'rxjs';
import { catchError, concatMap, last, scan, tap } from 'rxjs/operators';
import { eachValueFrom } from '@nrwl/devkit/src/utils/rxjs-for-await';
import * as autoprefixer from 'autoprefixer';
import type { ExecutorContext } from '@nrwl/devkit';
import { joinPathFragments, logger, names, readJsonFile } from '@nrwl/devkit';
import {
  calculateProjectDependencies,
  computeCompilerOptionsPaths,
  DependentBuildableProjectNode,
} from '@nrwl/workspace/src/utilities/buildable-libs-utils';
import resolve from '@rollup/plugin-node-resolve';

import { AssetGlobPattern, RollupExecutorOptions } from './schema';
import { runRollup } from './lib/run-rollup';
import {
  NormalizedRollupExecutorOptions,
  normalizeRollupExecutorOptions,
} from './lib/normalize';
import { analyze } from './lib/analyze-plugin';
import { deleteOutputDir } from '../../utils/fs';
import { swc } from './lib/swc-plugin';
import { validateTypes } from './lib/validate-types';
import { updatePackageJson } from './lib/update-package-json';

// These use require because the ES import isn't correct.
const commonjs = require('@rollup/plugin-commonjs');
const image = require('@rollup/plugin-image');

const json = require('@rollup/plugin-json');
const copy = require('rollup-plugin-copy');
const postcss = require('rollup-plugin-postcss');

const fileExtensions = ['.js', '.jsx', '.ts', '.tsx'];

export async function* rollupExecutor(
  rawOptions: RollupExecutorOptions,
  context: ExecutorContext
) {
  process.env.NODE_ENV ??= 'production';

  const project = context.workspace.projects[context.projectName];
  const sourceRoot = project.sourceRoot;
  const { target, dependencies } = calculateProjectDependencies(
    context.projectGraph,
    context.root,
    context.projectName,
    context.targetName,
    context.configurationName,
    true
  );

  const options = normalizeRollupExecutorOptions(
    rawOptions,
    context.root,
    sourceRoot
  );

  // TODO(jack): Remove UMD in Nx 15
  if (options.format.includes('umd')) {
    if (options.format.includes('cjs')) {
      throw new Error(
        'Cannot use both UMD and CJS. We recommend you use ESM or CJS.'
      );
    } else {
      logger.warn('UMD format is deprecated and will be removed in Nx 15');
    }
  }
  const packageJson = readJsonFile(options.project);

  const npmDeps = (context.projectGraph.dependencies[context.projectName] ?? [])
    .filter((d) => d.target.startsWith('npm:'))
    .map((d) => d.target.slice(4));

  const rollupOptions = createRollupOptions(
    options,
    dependencies,
    context,
    packageJson,
    sourceRoot,
    npmDeps
  );

  if (options.compiler === 'swc') {
    try {
      await validateTypes({
        workspaceRoot: context.root,
        projectRoot: options.projectRoot,
        tsconfig: options.tsConfig,
      });
    } catch {
      return { success: false };
    }
  }

  if (options.watch) {
    const watcher = rollup.watch(rollupOptions);
    return yield* eachValueFrom(
      new Observable<{ success: boolean }>((obs) => {
        watcher.on('event', (data) => {
          if (data.code === 'START') {
            logger.info(`Bundling ${context.projectName}...`);
          } else if (data.code === 'END') {
            updatePackageJson(
              options,
              context,
              target,
              dependencies,
              packageJson
            );
            logger.info('Bundle complete. Watching for file changes...');
            obs.next({ success: true });
          } else if (data.code === 'ERROR') {
            logger.error(`Error during bundle: ${data.error.message}`);
            obs.next({ success: false });
          }
        });
        // Teardown logic. Close watcher when unsubscribed.
        return () => watcher.close();
      })
    );
  } else {
    logger.info(`Bundling ${context.projectName}...`);

    // Delete output path before bundling
    if (options.deleteOutputPath) {
      deleteOutputDir(context.root, options.outputPath);
    }

    const start = process.hrtime.bigint();

    return from(rollupOptions)
      .pipe(
        concatMap((opts) =>
          runRollup(opts).pipe(
            catchError((e) => {
              logger.error(`Error during bundle: ${e}`);
              return of({ success: false });
            })
          )
        ),
        scan(
          (acc, result) => {
            if (!acc.success) return acc;
            return result;
          },
          { success: true }
        ),
        last(),
        tap({
          next: (result) => {
            if (result.success) {
              const end = process.hrtime.bigint();
              const duration = `${(Number(end - start) / 1_000_000_000).toFixed(
                2
              )}s`;

              updatePackageJson(
                options,
                context,
                target,
                dependencies,
                packageJson
              );
              logger.info(`⚡ Done in ${duration}`);
            } else {
              logger.error(`Bundle failed: ${context.projectName}`);
            }
          },
        })
      )
      .toPromise();
  }
}

// -----------------------------------------------------------------------------

export function createRollupOptions(
  options: NormalizedRollupExecutorOptions,
  dependencies: DependentBuildableProjectNode[],
  context: ExecutorContext,
  packageJson: any,
  sourceRoot: string,
  npmDeps: string[]
): rollup.InputOptions[] {
  const useBabel = options.compiler === 'babel';
  const useTsc = options.compiler === 'tsc';
  const useSwc = options.compiler === 'swc';

  const tsConfigPath = joinPathFragments(context.root, options.tsConfig);
  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsConfigPath)
  );

  if (!options.format || !options.format.length) {
    options.format = readCompatibleFormats(config);
  }

  return options.format.map((format, idx) => {
    const plugins = [
      copy({
        targets: convertCopyAssetsToRollupOptions(
          options.outputPath,
          options.assets
        ),
      }),
      image(),
      json(),
      (useTsc || useBabel) &&
        require('rollup-plugin-typescript2')({
          check: true,
          tsconfig: options.tsConfig,
          tsconfigOverride: {
            compilerOptions: createTsCompilerOptions(
              config,
              dependencies,
              options
            ),
          },
        }),
      peerDepsExternal({
        packageJsonPath: options.project,
      }),
      postcss({
        inject: true,
        extract: options.extractCss,
        autoModules: true,
        plugins: [autoprefixer],
        use: {
          less: {
            javascriptEnabled: options.javascriptEnabled,
          },
        },
      }),
      resolve({
        preferBuiltins: true,
        extensions: fileExtensions,
      }),
      useSwc && swc(),
      useBabel &&
        getBabelInputPlugin({
          // Let's `@nrwl/web/babel` preset know that we are packaging.
          caller: {
            // @ts-ignore
            // Ignoring type checks for caller since we have custom attributes
            isNxPackage: true,
            // Always target esnext and let rollup handle cjs/umd
            supportsStaticESM: true,
            isModern: true,
          },
          cwd: join(context.root, sourceRoot),
          rootMode: 'upward',
          babelrc: true,
          extensions: fileExtensions,
          babelHelpers: 'bundled',
          skipPreflightCheck: true, // pre-flight check may yield false positives and also slows down the build
          exclude: /node_modules/,
          plugins: [
            format === 'esm'
              ? undefined
              : require.resolve('babel-plugin-transform-async-to-promises'),
          ].filter(Boolean),
        }),
      commonjs(),
      analyze(),
    ];

    const globals = options.globals
      ? options.globals.reduce(
          (acc, item) => {
            acc[item.moduleId] = item.global;
            return acc;
          },
          { 'react/jsx-runtime': 'jsxRuntime' }
        )
      : { 'react/jsx-runtime': 'jsxRuntime' };

    const externalPackages = dependencies
      .map((d) => d.name)
      .concat(options.external || [])
      .concat(Object.keys(packageJson.dependencies || {}));

    const rollupConfig = {
      input: options.outputFileName
        ? {
            [parse(options.outputFileName).name]: options.main,
          }
        : options.main,
      output: {
        globals,
        format,
        dir: `${options.outputPath}`,
        name: options.umdName || names(context.projectName).className,
        entryFileNames: `[name].${format === 'esm' ? 'js' : 'cjs'}`,
        chunkFileNames: `[name].${format === 'esm' ? 'js' : 'cjs'}`,
        // umd doesn't support code-split bundles
        inlineDynamicImports: format === 'umd',
      },
      external: (id) =>
        externalPackages.some(
          (name) => id === name || id.startsWith(`${name}/`)
        ) || npmDeps.some((name) => id === name || id.startsWith(`${name}/`)), // Could be a deep import
      plugins,
    };

    return options.rollupConfig.reduce((currentConfig, plugin) => {
      return require(plugin)(currentConfig, options);
    }, rollupConfig);
  });
}

function createTsCompilerOptions(
  config: ts.ParsedCommandLine,
  dependencies,
  options
) {
  const compilerOptionPaths = computeCompilerOptionsPaths(config, dependencies);
  const compilerOptions = {
    rootDir: options.entryRoot,
    allowJs: false,
    declaration: true,
    paths: compilerOptionPaths,
  };
  if (config.options.module === ts.ModuleKind.CommonJS) {
    compilerOptions['module'] = 'ESNext';
  }
  return compilerOptions;
}

interface RollupCopyAssetOption {
  src: string;
  dest: string;
}

function convertCopyAssetsToRollupOptions(
  outputPath: string,
  assets: AssetGlobPattern[]
): RollupCopyAssetOption[] {
  return assets
    ? assets.map((a) => ({
        src: join(a.input, a.glob).replace(/\\/g, '/'),
        dest: join(outputPath, a.output).replace(/\\/g, '/'),
      }))
    : undefined;
}

function readCompatibleFormats(config: ts.ParsedCommandLine) {
  switch (config.options.module) {
    case ts.ModuleKind.CommonJS:
      return ['cjs'];
    case ts.ModuleKind.UMD:
    case ts.ModuleKind.AMD:
      return ['umd'];
    default:
      return ['esm'];
  }
}

export default rollupExecutor;
