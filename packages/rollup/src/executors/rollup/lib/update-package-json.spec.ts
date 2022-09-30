import { updatePackageJson } from './update-package-json';
import * as utils from 'nx/src/utils/fileutils';
import { PackageJson } from 'nx/src/utils/package-json';

describe('updatePackageJson', () => {
  const commonOptions = {
    outputPath: 'dist/index.js',
    tsConfig: './tsconfig.json',
    project: './package.json',
    main: './index.js',
    entryRoot: '.',
    projectRoot: '.',
    assets: [],
    rollupConfig: [],
  };

  const sharedContext = {
    isVerbose: false,
    workspace: { version: 2, projects: {} },
    root: '',
    cwd: '',
  };

  // TODO(jack): In Nx 15 we want this field to always generate.
  describe('generateExportsField: true', () => {
    it('should support ESM', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          generateExportsField: true,
          format: ['esm'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        exports: {
          '.': {
            types: './index.d.ts',
            import: './index.js',
          },
        },
        main: './index.js',
        module: './index.js',
        type: 'module',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });

    it('should support CJS', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          generateExportsField: true,
          format: ['cjs'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        exports: {
          '.': {
            types: './index.d.ts',
            require: './index.cjs',
          },
        },
        main: './index.cjs',
        type: 'commonjs',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });

    it('should support ESM + CJS', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          generateExportsField: true,
          format: ['esm', 'cjs'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        exports: {
          '.': {
            types: './index.d.ts',
            import: './index.js',
            require: './index.cjs',
          },
        },
        main: './index.cjs',
        module: './index.js',
        type: 'module',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });

    it('should support custom exports field', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          generateExportsField: true,
          format: ['esm'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {
          exports: {
            './foo': {
              import: './foo.js',
            },
          },
        } as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        exports: {
          '.': {
            types: './index.d.ts',
            import: './index.js',
          },
          './foo': {
            import: './foo.js',
          },
        },
        main: './index.js',
        module: './index.js',
        type: 'module',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });
  });

  describe('generateExportsField: false', () => {
    it('should support ESM', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          format: ['esm'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        main: './index.js',
        module: './index.js',
        type: 'module',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });

    it('should support CJS', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          format: ['cjs'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        main: './index.cjs',
        type: 'commonjs',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });

    it('should support ESM + CJS', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          format: ['esm', 'cjs'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        main: './index.cjs',
        module: './index.js',
        type: 'module',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });

    it('should support custom exports field', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          format: ['esm'],
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {
          exports: {
            './foo': {
              import: './foo.js',
            },
          },
        } as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        main: './index.js',
        module: './index.js',
        type: 'module',
        types: './index.d.ts',
        exports: {
          './foo': {
            import: './foo.js',
          },
        },
      });

      spy.mockRestore();
    });
  });

  describe('skipTypeField', () => {
    it('should not add "type" field in package.json', () => {
      const spy = jest.spyOn(utils, 'writeJsonFile');

      updatePackageJson(
        {
          ...commonOptions,
          format: ['esm'],
          skipTypeField: true,
        },
        sharedContext,
        { type: 'app', name: 'test', data: {} },
        [],
        {} as unknown as PackageJson
      );

      expect(utils.writeJsonFile).toHaveBeenCalledWith(expect.anything(), {
        main: './index.js',
        module: './index.js',
        types: './index.d.ts',
      });

      spy.mockRestore();
    });
  });
});
