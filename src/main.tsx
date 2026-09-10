const root = document.getElementById('root');

if (!root) throw new Error('Application root element not found');

const isVNextRoute = window.location.pathname === '/v2' || window.location.pathname === '/v2/';

if (isVNextRoute) {
  void import('./vnext/app/bootstrap').then(({ mountVNextApp }) => mountVNextApp(root));
} else {
  void import('./legacy-main').then(({ mountLegacyApp }) => mountLegacyApp(root));
}
