import { dirname, join } from 'path';
import type { ProjectsConfigurations } from '@nrwl/devkit';
import { readWorkspaceConfig } from 'nx/src/project-graph/file-utils';

const JEST_RUNNER_TOKEN = '@nrwl/jest:jest';

function getJestConfigProjectPath(projectJestConfigPath: string): string {
  return join('<rootDir>', dirname(projectJestConfigPath));
}

export function getJestProjects() {
  const ws = readWorkspaceConfig({
    format: 'nx',
  }) as ProjectsConfigurations;
  const jestConfigurationSet = new Set<string>();
  for (const projectConfig of Object.values(ws.projects)) {
    if (!projectConfig.targets) {
      continue;
    }
    for (const targetConfiguration of Object.values(projectConfig.targets)) {
      if (targetConfiguration.executor !== JEST_RUNNER_TOKEN) {
        continue;
      }
      if (targetConfiguration.options?.jestConfig) {
        jestConfigurationSet.add(
          getJestConfigProjectPath(targetConfiguration.options.jestConfig)
        );
      }
      if (targetConfiguration.configurations) {
        for (const configurationObject of Object.values(
          targetConfiguration.configurations
        )) {
          if (configurationObject.jestConfig) {
            jestConfigurationSet.add(
              getJestConfigProjectPath(configurationObject.jestConfig)
            );
          }
        }
      }
    }
  }
  return Array.from(jestConfigurationSet);
}
