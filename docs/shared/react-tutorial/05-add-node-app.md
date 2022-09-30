# React Nx Tutorial - Step 5: Add Node Application Implementing API

{% youtube
src="https://www.youtube.com/embed/XgfknOqgxQ0"
title="Nx.dev Tutorial | React | Step 5: Add Node Application Implementing API"
width="100%" /%}

The requests fail because the API has not been created yet. Using Nx you develop node applications next to your React applications. You can use same commands to run and test them. You share code between the backend and the frontend. Use this capability to implement the API service.

## Add Express plugin to your workspace

Nx is an open platform with plugins for many modern tools and frameworks. **To see some plugins, run `npx nx list`:**

```bash
>  NX   Installed plugins:

  @nrwl/cypress (executors,generators)
  @nrwl/jest (executors,generators)
  @nrwl/linter (executors,generators)
  @nrwl/nx-cloud (generators)
  @nrwl/react (generators)
  @nrwl/storybook (executors,generators)
  @nrwl/web (executors,generators)
  @nrwl/workspace (executors,generators)


>  NX   Also available:

  @nrwl/angular (generators)
  @nrwl/express (executors,generators)
  @nrwl/nest (executors,generators)
  @nrwl/next (executors,generators)
  @nrwl/node (executors,generators)
  @nrwl/nx-plugin (executors,generators)


>  NX   Community plugins:

  nx-plugins - Nx plugin integrations with ESBuild / Vite / Snowpack / Prisma, with derived ESBuild / nowpack / ... plugins.
  @codebrew/nx-aws-cdk - An Nx plugin for aws cdk develop.
  ...
```

**Add the dependency:**

{% tabs %}
{% tab label="yarn" %}

```bash
yarn add --dev @nrwl/express
```

{% /tab %}
{% tab label="npm" %}

```bash
npm install --save-dev @nrwl/express
```

{% /tab %}
{% /tabs %}

{% callout type="check" title="List plugins" %}
When installing `@nrwl/express`, it also automatically added `@nrwl/node` for you. Run `npx nx list @nrwl/express` and `npx nx list @nrwl/node` to see what those plugins provide.
{% /callout %}

## Generate an Express application

**Run the following to generate a new Express application:**

```bash
npx nx g @nrwl/express:app api --frontendProject=todos
```

After this is done, you should see something like this:

```treeview
myorg/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── assets/
│   │   │   ├── environments/
│   │   │   │   ├── environment.ts
│   │   │   │   └── environment.prod.ts
│   │   │   └── main.ts
│   │   ├── jest.config.ts
│   │   ├── project.json
│   │   ├── tsconfig.app.json
│   │   ├── tsconfig.json
│   │   └── tsconfig.spec.json
│   ├── todos/
│   │   ├── src/
│   │   ├── project.json
│   │   └── proxy.conf.json
│   └── todos-e2e/
├── libs/
├── tools/
├── nx.json
├── package.json
└── tsconfig.base.json
```

The `apps` directory is where Nx places anything you can run: frontend applications, backend applications, e2e test suites. That's why the `api` application appeared there.

You can run:

| Command          | Description           |
| ---------------- | --------------------- |
| npx nx serve api | serve the application |
| npx nx build api | build the application |
| npx nx test api  | test the application  |

**Add a file `apps/api/src/app/todos.ts`.**

```typescript
import { Express } from 'express';

interface Todo {
  title: string;
}

const todos: Todo[] = [{ title: 'Todo 1' }, { title: 'Todo 2' }];

export function addTodoRoutes(app: Express) {
  app.get('/api/todos', (req, resp) => resp.send(todos));
  app.post('/api/addTodo', (req, resp) => {
    const newTodo = {
      title: `New todo ${Math.floor(Math.random() * 1000)}`,
    };
    todos.push(newTodo);
    resp.send(newTodo);
  });
}
```

Here, you are building an Express application with Nx. Nx also comes with Next support, and you can also use any other node library you want.

**Next update `apps/api/src/main.ts` to register the routes**

```typescript
import * as express from 'express';
import { addTodoRoutes } from './app/todos';

const app = express();

app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to api!' });
});
addTodoRoutes(app);

const port = process.env.port || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
```

**Now run `npx nx serve api` to run the api server**

Refresh the application in the browser. The React app is now able to fetch and create todos by calling the API.

## What's Next

- Continue to [Step 6: Proxy](/react-tutorial/06-proxy)
