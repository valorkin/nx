# Node Nx Tutorial - Step 1: Create Application

{% youtube
src="https://www.youtube.com/embed/UcBSBQYNlhE"
title="Nx.dev Tutorial | Node | Step 1: Create Application"
width="100%" /%}

In this tutorial you use Nx to build a server application out of common libraries using modern technologies.

{% callout type="check" title="Integrated Repo" %}
This tutorial sets up an [integrated repo](/concepts/integrated-vs-package-based). If you prefer a [package-based repo](/concepts/integrated-vs-package-based), check out the [Core Tutorial](/getting-started/core-tutorial).
{% /callout %}

## Contents

- [1 - Create Application](/node-tutorial/01-create-application)
- [2 - Display Todos](/node-tutorial/02-display-todos)
- [3 - Share Code](/node-tutorial/03-share-code)
- [4 - Create Libraries](/node-tutorial/04-create-libs)
- [5 - Project Graph](/node-tutorial/05-dep-graph)
- [6 - Use Computation Caching](/node-tutorial/06-computation-caching)
- [7 - Test Affected Projects](/node-tutorial/07-test-affected-projects)
- [8 - Summary](/node-tutorial/08-summary)

## Create a New Workspace

**Start by creating a new workspace.**

```bash
npx create-nx-workspace@latest
```

You then receive the following prompts in your command line:

```bash
Workspace name (e.g., org name)         myorg
What to create in the new workspace     nest
Application name                        todos
```

> You can also choose to add [Nx Cloud](https://nx.app), but its not required for the tutorial.

```treeview
myorg/
├── README.md
├── apps/
│   └── todos/
│       ├── jest.config.ts
│       ├── src/
│       │   ├── app/
│       │   │   ├── app.controller.spec.ts
│       │   │   ├── app.controller.ts
│       │   │   ├── app.module.ts
│       │   │   ├── app.service.spec.ts
│       │   │   └── app.service.ts
│       │   ├── assets/
│       │   ├── environments/
│       │   │   ├── environment.prod.ts
│       │   │   └── environment.ts
│       │   └── main.ts
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       └── tsconfig.spec.json
├── libs/
├── tools/
├── .eslintrc.json
├── .prettierrc
├── jest.config.ts
├── jest.preset.js
├── nx.json
├── package.json
├── README.md
└── tsconfig.base.json
```

The generate command added one project to our workspace:

- A Nest application

## Note on the Nx CLI

Depending on how your dev env is set up, the command above might result in `Command 'nx' not found`.

To fix it, you can either install the `nx` cli globally by running:

{% tabs %}
{% tab label="yarn" %}

```bash
yarn global add nx
```

{% /tab %}
{% tab label="npm" %}

```bash
npm install -g nx
```

{% /tab %}
{% /tabs %}

Or you can prepend every command with `npm run`:

{% tabs %}
{% tab label="yarn" %}

```bash
yarn nx serve todos
```

{% /tab %}
{% tab label="npm" %}

```bash
npx nx serve todos
```

{% /tab %}
{% /tabs %}

## Project.json, Targets, Executors

You configure your projects in `project.json` files. These files contains the workspace projects with their command targets. For instance, `todos` has the `build`, `serve`, `lint`, and `test` targets. This means that you can run `nx build todos`, `nx serve todos`, etc..

Every target uses an executor which actually runs this target. So targets are analogous to typed npm scripts, and executors are analogous to typed shell scripts.

**Why not use shell scripts and npm scripts directly?**

There are a lot of advantages to providing additional metadata to the build tool. For instance, you can introspect targets. `nx serve todos --help` results in:

```bash
nx run todos:serve [options,...]

Options:
  --buildTarget           The target to run to build you the app
  --waitUntilTargets      The targets to run to before starting the node app (default: )
  --host                  The host to inspect the process on (default: localhost)
  --port                  The port to inspect the process on. Setting port to 0 will assign random free ports to all forked processes.
  --watch                 Run build when files change (default: true)
  --inspect               Ensures the app is starting with debugging (default: inspect)
  --runtimeArgs           Extra args passed to the node process (default: )
  --args                  Extra args when starting the app (default: )
  --help                  Show available options for project target.
```

It helps with good editor integration (see [VSCode Support](/core-features/integrate-with-editors#nx-console-for-vscode)).

But, most importantly, it provides a holistic dev experience regardless of the tools used, and enables advanced build features like distributed computation caching and distributed builds).

## Serve the newly created application

Now that the application is set up, run it locally via:

```bash
nx serve todos
```

## What's Next

- Continue to [Step 2: Display todos](/node-tutorial/02-display-todos)
