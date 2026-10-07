import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly db = inject(Supabase).client;
  readonly sesion = signal<Session | null>(null);
  readonly esAdmin = signal(false);
  private readonly listo: Promise<void>;

  constructor() {
    this.listo = this.db.auth.getSession().then(({ data }) => this.cargar(data.session));
    this.db.auth.onAuthStateChange((_evento, sesion) => {
      // Llamar a Supabase dentro de este callback puede bloquear el cliente; se difiere.
      if (sesion?.user.id !== this.sesion()?.user.id) setTimeout(() => this.cargar(sesion));
    });
  }

  private async cargar(sesion: Session | null) {
    this.sesion.set(sesion);
    if (!sesion) return this.esAdmin.set(false);
    // La política de admins solo deja ver la fila propia: si existe, es admin.
    const { data } = await this.db.from('admins').select('user_id').eq('user_id', sesion.user.id).maybeSingle();
    this.esAdmin.set(!!data);
  }

  async comprobado(): Promise<boolean> {
    await this.listo;
    return this.esAdmin();
  }

  async entrar(email: string, password: string): Promise<void> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    await this.cargar(data.session);
    if (!this.esAdmin()) {
      await this.salir();
      throw new Error('Esta cuenta no tiene permisos de administración.');
    }
  }

  /** Envía el correo para elegir una contraseña nueva. Supabase responde igual exista o no la cuenta (no revela quién es admin). */
  async pedirRecuperacion(email: string): Promise<void> {
    const { error } = await this.db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin/restablecer` });
    if (error) throw new Error(traducir(error.message));
  }

  /** Cambia la contraseña de la sesión actual (la que abre el enlace del correo de recuperación). */
  async cambiarPassword(password: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ password });
    if (error) throw new Error(traducir(error.message));
  }

  async salir(): Promise<void> {
    await this.db.auth.signOut();
    await this.cargar(null);
  }
}

function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes('rate limit') || m.includes('only request this after')) return 'Espera unos minutos antes de pedir otro enlace.';
  if (m.includes('different from the old')) return 'La nueva contraseña debe ser distinta de la actual.';
  if (m.includes('at least')) return 'La contraseña es demasiado corta.';
  if (m.includes('session missing') || m.includes('expired')) return 'El enlace venció o ya se usó. Pide uno nuevo desde la pantalla de entrada.';
  return mensaje;
}

export const soloAdmin: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.comprobado()) || router.createUrlTree(['/admin/entrar']);
};
