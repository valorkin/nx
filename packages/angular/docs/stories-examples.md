This generator will generate stories for all your components in your project.

```bash
nx g @nrwl/angular:stories project-name
```

You can read more about how this generator works, in the [Storybook for Angular overview page](/storybook/overview-angular#auto-generate-stories).

When running this generator, you will be prompted to provide the following:

- The `name` of the project you want to generate the configuration for.
- Whether you want to `generateCypressSpecs`. If you choose `yes`, a test file is going to be generated in the project's Cypress e2e app for each of your components.

You must provide a `name` for the generator to work.

There are a number of other options available. Let's take a look at some examples.

## Examples

### Ignore certain paths when generating stories

```bash
nx g @nrwl/angular:stories ui --ignorePaths=libs/ui/src/not-stories/**,**/**/src/**/*.other.*
```

This will generate stories for all the components in the `ui` project, except for the ones in the `libs/ui/src/not-stories` directory, and also for components that their file name is of the pattern `*.other.*`.

This is useful if you have a project that contains components that are not meant to be used in isolation, but rather as part of a larger component.
