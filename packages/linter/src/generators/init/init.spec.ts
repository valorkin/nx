import { Linter } from '../utils/linter';
import { readJson, Tree } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { lintInitGenerator } from './init';

describe('@nrwl/linter:init', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('--linter', () => {
    describe('eslint', () => {
      it('should generate the global eslint config', async () => {
        await lintInitGenerator(tree, {
          linter: Linter.EsLint,
        });

        expect(tree.read('.eslintrc.json', 'utf-8')).toMatchSnapshot();
      });

      it('should add the root eslint config to the lint targetDefaults for lint', async () => {
        await lintInitGenerator(tree, {
          linter: Linter.EsLint,
        });

        expect(readJson(tree, 'nx.json').targetDefaults.lint).toEqual({
          inputs: ['default', '{workspaceRoot}/.eslintrc.json'],
        });
      });

      it('should not generate the global eslint config if it already exist', async () => {
        tree.write('.eslintrc.js', '{}');

        await lintInitGenerator(tree, {
          linter: Linter.EsLint,
        });

        expect(tree.exists('.eslintrc.json')).toBe(false);
      });
    });
  });
});
