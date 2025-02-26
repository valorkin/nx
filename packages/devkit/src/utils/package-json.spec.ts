import type { Tree } from 'nx/src/generators/tree';
import { readJson, writeJson } from 'nx/src/generators/utils/json';
import { addDependenciesToPackageJson } from './package-json';
import { createTree } from 'nx/src/generators/testing-utils/create-tree';

describe('addDependenciesToPackageJson', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTree();
    writeJson(tree, 'package.json', {
      dependencies: {
        react: 'latest',
      },
      devDependencies: {
        jest: 'latest',
      },
    });
  });

  it('should add dependencies to the package.json', () => {
    const installTask = addDependenciesToPackageJson(
      tree,
      {
        'react-dom': 'latest',
      },
      {}
    );
    expect(readJson(tree, 'package.json').dependencies).toEqual({
      react: 'latest',
      'react-dom': 'latest',
    });
    expect(installTask).toBeDefined();
  });

  it('should not overwrite existing dependencies in the package.json', () => {
    const installTask = addDependenciesToPackageJson(
      tree,
      {
        react: 'next',
      },
      {}
    );
    expect(readJson(tree, 'package.json').dependencies).toEqual({
      react: 'latest',
    });
    expect(installTask).toBeDefined();
  });

  it('should add devDependencies to the package.json', () => {
    const installTask = addDependenciesToPackageJson(
      tree,
      {},
      {
        '@nrwl/react': 'latest',
      }
    );
    expect(readJson(tree, 'package.json').devDependencies).toEqual({
      jest: 'latest',
      '@nrwl/react': 'latest',
    });
    expect(installTask).toBeDefined();
  });

  it('should not overwrite existing devDependencies in the package.json', () => {
    const installTask = addDependenciesToPackageJson(
      tree,
      {},
      {
        jest: 'next',
      }
    );
    expect(readJson(tree, 'package.json').devDependencies).toEqual({
      jest: 'latest',
    });
    expect(installTask).toBeDefined();
  });

  it('should not add dependencies when they exist in devDependencies or vice versa', () => {
    // ARRANGE
    writeJson(tree, 'package.json', {
      dependencies: {
        '@nrwl/angular': 'latest',
      },
      devDependencies: {
        '@nrwl/next': 'latest',
      },
    });

    // ACT
    const installTask = addDependenciesToPackageJson(
      tree,
      {
        '@nrwl/next': 'next',
      },
      {
        '@nrwl/angular': 'next',
      }
    );

    // ASSERT
    const { dependencies, devDependencies } = readJson(tree, 'package.json');
    expect(dependencies).toEqual({
      '@nrwl/angular': 'latest',
    });
    expect(devDependencies).toEqual({
      '@nrwl/next': 'latest',
    });
    expect(installTask).toBeDefined();
  });

  it('should add additional dependencies when they dont exist in devDependencies or vice versa and not update the ones that do exist', () => {
    // ARRANGE
    writeJson(tree, 'package.json', {
      dependencies: {
        '@nrwl/angular': 'latest',
      },
      devDependencies: {
        '@nrwl/next': 'latest',
      },
    });

    // ACT
    const installTask = addDependenciesToPackageJson(
      tree,
      {
        '@nrwl/next': 'next',
        '@nrwl/cypress': 'latest',
      },
      {
        '@nrwl/angular': 'next',
      }
    );

    // ASSERT
    const { dependencies, devDependencies } = readJson(tree, 'package.json');
    expect(dependencies).toEqual({
      '@nrwl/angular': 'latest',
      '@nrwl/cypress': 'latest',
    });
    expect(devDependencies).toEqual({
      '@nrwl/next': 'latest',
    });
    expect(installTask).toBeDefined();
  });
});
