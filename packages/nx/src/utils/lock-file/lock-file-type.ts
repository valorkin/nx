export interface PackageDependency {
  version?: string;
  packageMeta: any[];
  dependencies?: Record<string, string>;
  [key: string]: any;
}

export type PackageVersions = Record<string, PackageDependency>;

export type LockFileData = {
  dependencies: Record<string, PackageVersions>;
  lockFileMetadata?: Record<string, any>;
  hash: string;
};
