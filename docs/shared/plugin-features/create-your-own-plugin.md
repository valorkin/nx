# Create Your Own Plugin

Nx is like the VSCode of build tools. The core of Nx enables project and task graph creation and analysis, orchestration and
execution of tasks, computation caching, and code generation. [Nx plugins](#nx-plugins) extend this functionality and are built on top of the underlying [Nx Devkit](#nx-devkit).

{% callout type="note" title="Plugins are optional" %}
Many organizations use Nx without any plugins. If you are mainly interested in making your workspace faster or enabling distributed task execution, then plugins aren't necessary.
{% /callout %}

## Nx plugins

Nx plugins are npm packages that contain generators and executors to extend the capabilities of an Nx workspace.

Plugins have:

- **Generators**

  - Generators automate making changes to the file system.
  - Anytime you run `nx generate ...`, you invoke a generator.
  - They are used to create/update applications, libraries, components, and more.

- **Executors**

  - Executors define how to perform an action on a project.
  - You invoke an executor with `nx run ...` (or `nx test`, `nx build`).
  - They are used to build applications and libraries, test them, lint them, and more.

- **Project Graph Extensions**

  - Plugins can provide a function `processProjectGraph` to add extra edges to the project graph.
  - This allows plugins to influence the behavior of `nx affected` and the project graph visualization.
  - See [project graph plugins](/recipe/project-graph-plugins) for more information.

- **Project Inference Extensions**

  - Plugins can provide an array of glob patterns, `projectFilePatterns` that are used to infer project information.
  - Plugins can provide a function `registerProjectTargets` that takes in one of the matched project files, and
    returns an object containing inferred targets from the file.
  - This allows plugins to add new projects to the workspace that aren't identified by `project.json` or `package.json` files, and infer extra
    targets without adding them into project configuration.

All the core plugins are written using Nx Devkit, and you can use the same utilities to write your own generators and
executors.

{% callout type="check" title="Plugins!" %}
The Nx team maintains a core set of plugins for many application and tooling frameworks. You can write [custom generators](/recipe/local-generators) and [executors](/recipe/creating-custom-executors) for your own workspace. You can also write your own plugin and share it with the community. The [Nx Plugin](/packages/nx-plugin) plugin provides guidance on how you can build your own custom plugins.
{% /callout %}

### Local workspace plugins

Nx plugins can also be used in the workspace they are generated inside of. For example, if you generate a plugin with `nx g @nrwl/nx-plugin:plugin my-plugin --importPath @my-org/my-plugin`, you will be able to immediately make use of generators and executors within it. This would look like `nx g @my-org/my-plugin:lib` for generators or `"executor": "@my-org/my-plugin:build"` for executors.

If you are only planning on making use of generators, Nx provides workspace generators which can be used rather than whole plugins.

Generating a full plugin allows you to take advantage of all of the capabilities above, including project inference and graph extension, which is not possible when solely using workspace generators.

Additionally, your local plugin could be set as the default collection in `nx.json`, such that running `nx g lib` would call your workspace plugin's lib generator.

### Listing Nx plugins

Nx provides a list of installed and available plugins from Nrwl and community maintainers. Plugins maintained by Nrwl
maintained are scoped under the `@nrwl` organization.

Use the `nx list` command to display all registered plugins.

Using the `nx list [plugin]` command displays the generators and executors provided by that package.

## Nx Devkit

The Nx Devkit is the underlying technology used to customize Nx to support different technologies and custom use-cases.
It contains many utility functions for reading and writing files, updating configuration, working with Abstract Syntax
Trees (ASTs), and more.

### Pay as you go

As with most things in Nx, the core of Nx Devkit is very simple. It only uses language primitives and immutable
objects (the tree being the only exception). See [Simplest Generator](/recipe/creating-files)
and [Simplest Executor](/plugin-features/use-task-executors#simplest-executor) for examples on creating generators
and executors. The [Using Executors](/plugin-features/use-task-executors)
and [Using Generators](/plugin-features/use-code-generators) guides also have additional information on executors
and generators.

## Learn more

- [Creating and Publishing Your Own Nx Plugin - Youtube](https://www.youtube.com/watch?v=vVT7Al01VZc)
- [Local generators](/recipe/local-generators)
- [Local executors](/recipe/creating-custom-executors)
- [Nx Community Plugins](/community)
