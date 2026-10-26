import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { BingoGame } from './screens/BingoGame';
import { CalledItGame } from './screens/CalledItGame';
import { CustomLists, EditCustomList } from './screens/CustomLists';
import { Home } from './screens/Home';
import { Join } from './screens/Join';
import { Setup } from './screens/Setup';
import { Winner } from './screens/Winner';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/setup', component: Setup });
const calledItRoute = createRoute({ getParentRoute: () => rootRoute, path: '/play/called-it', component: CalledItGame });
const bingoRoute = createRoute({ getParentRoute: () => rootRoute, path: '/play/bingo', component: BingoGame });
const winnerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/winner', component: Winner });
const listsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lists', component: CustomLists });
const newListRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lists/new', component: () => <EditCustomList /> });
const editListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$packId',
  component: function EditListRoute() {
    const { packId } = editListRoute.useParams();
    return <EditCustomList packId={packId} />;
  },
});
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/j/$code',
  component: function JoinRoute() {
    const { code } = joinRoute.useParams();
    return <Join code={code} />;
  },
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  setupRoute,
  calledItRoute,
  bingoRoute,
  winnerRoute,
  listsRoute,
  newListRoute,
  editListRoute,
  joinRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
