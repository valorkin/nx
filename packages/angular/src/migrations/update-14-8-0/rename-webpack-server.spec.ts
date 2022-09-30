import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { readJson, updateJson } from '@nrwl/devkit';
import remote from '../../generators/remote/remote';
import renameWebpackServer from './rename-webpack-server';

describe('renameWebpackServer', () => {
  it('should rename webpack-server to webpack-dev-server correctly', async () => {
    // ARRANGE
    const tree = createTreeWithEmptyWorkspace();
    await remote(tree, { name: 'remote' });

    updateJson(tree, 'apps/remote/project.json', (json) => {
      json.targets.serve.executor = '@nrwl/angular:webpack-server';
      return json;
    });

    // ACT
    renameWebpackServer(tree);

    // ASSERT
    const serveTarget = readJson(tree, 'apps/remote/project.json').targets
      .serve;
    expect(serveTarget).toMatchInlineSnapshot(`
      Object {
        "configurations": Object {
          "development": Object {
            "browserTarget": "remote:build:development",
          },
          "production": Object {
            "browserTarget": "remote:build:production",
          },
        },
        "defaultConfiguration": "development",
        "executor": "@nrwl/angular:webpack-dev-server",
        "options": Object {
          "port": 4201,
          "publicHost": "http://localhost:4201",
        },
      }
    `);
  });
});
