import type { Tree } from '@nrwl/devkit';
import {
  generateFiles,
  joinPathFragments,
  readWorkspaceConfiguration,
} from '@nrwl/devkit';
import type { Schema } from '../schema';
import { addRoute } from '../../../utils/nx-devkit/route-utils';

export function addRemoteEntry(
  tree: Tree,
  { appName, routing, mfType, prefix, standalone }: Schema,
  appRoot: string
) {
  if (mfType === 'remote') {
    prefix = prefix ?? readWorkspaceConfiguration(tree).npmScope;
    generateFiles(
      tree,
      standalone
        ? joinPathFragments(
            __dirname,
            '../files/standalone-entry-component-files'
          )
        : joinPathFragments(__dirname, '../files/entry-module-files'),
      `${appRoot}/src/app/remote-entry`,
      {
        tmpl: '',
        appName,
        routing,
        prefix,
      }
    );

    if (standalone && routing) {
      addRoute(
        tree,
        joinPathFragments(appRoot, 'src/app/app.routes.ts'),
        `{path: '', loadChildren: () => import('./remote-entry/entry.routes').then(m => m.remoteRoutes)}`
      );
    } else {
      if (routing) {
        addRoute(
          tree,
          joinPathFragments(appRoot, 'src/app/app.routes.ts'),
          `{path: '', loadChildren: () => import('./remote-entry/entry.module').then(m => m.RemoteEntryModule)}`
        );
      }

      tree.write(
        `${appRoot}/src/app/app.module.ts`,
        `/* 
      * This RemoteEntryModule is imported here to allow TS to find the Module during 
      * compilation, allowing it to be included in the built bundle. This is required 
      * for the Module Federation Plugin to expose the Module correctly.
      * */
      import { RemoteEntryModule } from './remote-entry/entry.module';
${tree.read(`${appRoot}/src/app/app.module.ts`, 'utf-8')}`
      );
    }
  }
}
