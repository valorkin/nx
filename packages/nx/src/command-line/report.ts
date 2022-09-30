import * as chalk from 'chalk';
import { workspaceRoot } from '../utils/workspace-root';
import { output } from '../utils/output';
import { join } from 'path';
import {
  detectPackageManager,
  getPackageManagerVersion,
} from '../utils/package-manager';
import { readJsonFile } from '../utils/fileutils';
import { PackageJson, readModulePackageJson } from '../utils/package-json';
import { getLocalWorkspacePlugins } from '../utils/plugins/local-plugins';
import {
  createProjectGraphAsync,
  readProjectsConfigurationFromProjectGraph,
} from '../project-graph/project-graph';

export const packagesWeCareAbout = [
  'nx',
  '@nrwl/angular',
  '@nrwl/cypress',
  '@nrwl/detox',
  '@nrwl/devkit',
  '@nrwl/esbuild',
  '@nrwl/eslint-plugin-nx',
  '@nrwl/expo',
  '@nrwl/express',
  '@nrwl/jest',
  '@nrwl/js',
  '@nrwl/linter',
  '@nrwl/nest',
  '@nrwl/next',
  '@nrwl/node',
  '@nrwl/nx-cloud',
  '@nrwl/nx-plugin',
  '@nrwl/react',
  '@nrwl/react-native',
  '@nrwl/rollup',
  '@nrwl/schematics',
  '@nrwl/storybook',
  '@nrwl/web',
  '@nrwl/webpack',
  '@nrwl/workspace',
  'typescript',
];

export const patternsWeIgnoreInCommunityReport: Array<string | RegExp> = [
  ...packagesWeCareAbout,
  '@schematics/angular',
  new RegExp('@angular/*'),
  '@nestjs/schematics',
];

/**
 * Reports relevant version numbers for adding to an Nx issue report
 *
 * @remarks
 *
 * Must be run within an Nx workspace
 *
 */
export async function reportHandler() {
  const pm = detectPackageManager();
  const pmVersion = getPackageManagerVersion(pm);

  const bodyLines = [
    `Node : ${process.versions.node}`,
    `OS   : ${process.platform} ${process.arch}`,
    `${pm.padEnd(5)}: ${pmVersion}`,
    ``,
  ];

  packagesWeCareAbout.forEach((p) => {
    bodyLines.push(`${chalk.green(p)} : ${chalk.bold(readPackageVersion(p))}`);
  });

  bodyLines.push('---------------------------------------');

  try {
    const projectGraph = await createProjectGraphAsync({ exitOnError: true });
    bodyLines.push('Local workspace plugins:');
    const plugins = getLocalWorkspacePlugins(
      readProjectsConfigurationFromProjectGraph(projectGraph)
    ).keys();
    for (const plugin of plugins) {
      bodyLines.push(`\t ${chalk.green(plugin)}`);
    }
    bodyLines.push(...plugins);
  } catch {
    bodyLines.push('Unable to construct project graph');
  }

  bodyLines.push('---------------------------------------');

  const communityPlugins = findInstalledCommunityPlugins();
  bodyLines.push('Community plugins:');
  communityPlugins.forEach((p) => {
    bodyLines.push(`\t ${chalk.green(p.package)}: ${chalk.bold(p.version)}`);
  });

  output.log({
    title: 'Report complete - copy this into the issue template',
    bodyLines,
  });
}

export function readPackageJson(p: string): PackageJson | null {
  try {
    return readModulePackageJson(p).packageJson;
  } catch {
    return null;
  }
}

export function readPackageVersion(p: string): string {
  return readPackageJson(p)?.version || 'Not Found';
}

export function findInstalledCommunityPlugins(): {
  package: string;
  version: string;
}[] {
  const { dependencies, devDependencies } = readJsonFile(
    join(workspaceRoot, 'package.json')
  );
  const deps = [
    Object.keys(dependencies || {}),
    Object.keys(devDependencies || {}),
  ].flat();

  return deps.reduce(
    (arr: any[], nextDep: string): { project: string; version: string }[] => {
      if (
        patternsWeIgnoreInCommunityReport.some((pattern) =>
          typeof pattern === 'string'
            ? pattern === nextDep
            : pattern.test(nextDep)
        )
      ) {
        return arr;
      }
      try {
        const depPackageJson: Partial<PackageJson> =
          readPackageJson(nextDep) || {};
        if (
          [
            'ng-update',
            'nx-migrations',
            'schematics',
            'generators',
            'builders',
            'executors',
          ].some((field) => field in depPackageJson)
        ) {
          arr.push({ package: nextDep, version: depPackageJson.version });
          return arr;
        } else {
          return arr;
        }
      } catch {
        console.warn(`Error parsing packageJson for ${nextDep}`);
        return arr;
      }
    },
    []
  );
}
