import type { Tree } from '@nrwl/devkit';
import { generateFiles, joinPathFragments } from '@nrwl/devkit';
import { getRelativePathToRootTsConfig } from '@nrwl/workspace/src/utilities/typescript';
import type { NormalizedSchema } from './normalized-schema';

export function createFiles(tree: Tree, options: NormalizedSchema) {
  generateFiles(
    tree,
    joinPathFragments(__dirname, '../files'),
    options.appProjectRoot,
    {
      ...options,
      rootTsConfigPath: getRelativePathToRootTsConfig(
        tree,
        options.appProjectRoot
      ),
      tpl: '',
    }
  );

  if (!options.routing) {
    tree.delete(
      joinPathFragments(options.appProjectRoot, 'src/app/app.routes.ts')
    );
  }
}
