/**
 * Reglas de arquitectura. Se verifican con `npm run check:boundaries` (y en el CI).
 * Si una regla falla, el pull request no debe integrarse: hay que reorganizar la dependencia.
 */
module.exports = {
  forbidden: [
    {
      name: 'modulo-solo-usa-la-api-publica-de-otro',
      comment:
        'Un módulo solo puede importar de otro módulo a través de su index.ts. ' +
        'Importar su repositorio, servicio o DTO acopla los módulos y rompe el monolito modular.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-no-depende-de-modulos',
      comment: 'La carpeta shared es la base común: no puede conocer ningún módulo de negocio.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'infraestructura-no-depende-de-modulos',
      comment: 'infrastructure/ (pagos, correo, tiempo real) son adaptadores: no conocen la lógica de los módulos.',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'jobs-solo-usan-la-api-publica-de-los-modulos',
      comment: 'Las tareas programadas llaman a los módulos únicamente por su index.ts.',
      severity: 'error',
      from: { path: '^src/jobs/' },
      to: { path: '^src/modules/[^/]+/', pathNot: '^src/modules/[^/]+/index\\.ts$' },
    },
    {
      name: 'dominio-sin-infraestructura',
      comment: 'La lógica de dominio (domain/) es pura: no usa base de datos, Express ni librerías de red.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/domain/' },
      to: { path: ['^src/shared/database/', '^src/shared/middleware/', 'node_modules/(express|pg)/'] },
    },
    {
      name: 'controlador-no-accede-a-la-base-de-datos',
      comment: 'Los controladores delegan en el servicio; el repositorio es el único que habla con la BD.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/[^/]+\\.controller\\.ts$' },
      to: { path: ['\\.repository\\.ts$', '^src/shared/database/'] },
    },
    {
      name: 'sin-dependencias-circulares',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '__tests__' },
  },
};
