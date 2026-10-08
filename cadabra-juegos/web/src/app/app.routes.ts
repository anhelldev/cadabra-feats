import { Routes } from '@angular/router';
import { soloAdmin } from './core/auth';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./catalogo/catalogo').then((m) => m.Catalogo), title: 'Juegos de Cadabra' },
  { path: 'torneos', loadComponent: () => import('./torneos/torneos-publico').then((m) => m.TorneosPublico), title: 'Torneos de Cadabra' },
  {
    path: 'admin/entrar',
    loadComponent: () => import('./admin/entrar').then((m) => m.Entrar),
    title: 'Entrar · Panel de Cadabra',
  },
  {
    path: 'admin/restablecer',
    loadComponent: () => import('./admin/restablecer').then((m) => m.Restablecer),
    title: 'Nueva contraseña · Panel de Cadabra',
  },
  {
    path: 'admin',
    canActivate: [soloAdmin],
    loadComponent: () => import('./admin/panel').then((m) => m.Panel),
    title: 'Panel de Cadabra',
  },
  {
    path: 'admin/solicitudes',
    canActivate: [soloAdmin],
    loadComponent: () => import('./admin/solicitudes').then((m) => m.SolicitudesPagina),
    title: 'Solicitudes · Panel de Cadabra',
  },
  {
    path: 'admin/torneos',
    canActivate: [soloAdmin],
    loadComponent: () => import('./admin/torneos').then((m) => m.TorneosAdmin),
    title: 'Torneos · Panel de Cadabra',
  },
  { path: '**', redirectTo: '' },
];
