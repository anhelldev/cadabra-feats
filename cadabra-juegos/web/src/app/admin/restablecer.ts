import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';

const MINIMO = 8;

type Estado = 'comprobando' | 'listo' | 'invalido' | 'hecho';

@Component({
  selector: 'app-restablecer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <div class="tarjeta">
        <p class="marca">Juegos de Cadabra</p>
        <h1>Nueva contraseña</h1>

        @switch (estado()) {
          @case ('comprobando') {
            <p class="texto" role="status">Comprobando el enlace…</p>
          }
          @case ('invalido') {
            <p class="error" role="alert">{{ motivo() }}</p>
            <a class="boton" routerLink="/admin/entrar">Volver a la pantalla de entrada</a>
          }
          @case ('hecho') {
            <p class="texto" role="status">Listo, tu contraseña quedó actualizada.</p>
            <a class="boton" routerLink="/admin">Ir al panel</a>
          }
          @default {
            <form (submit)="guardar($event)">
              <label class="campo">
                Nueva contraseña
                <input name="nueva" type="password" autocomplete="new-password" required [attr.minlength]="minimo" />
              </label>
              <label class="campo">
                Repite la contraseña
                <input name="repetida" type="password" autocomplete="new-password" required [attr.minlength]="minimo" />
              </label>
              <p class="ayuda">Mínimo {{ minimo }} caracteres.</p>
              @if (error()) {
                <p class="error" role="alert">{{ error() }}</p>
              }
              <button class="boton" type="submit" [disabled]="enviando()">{{ enviando() ? 'Guardando…' : 'Guardar contraseña' }}</button>
            </form>
          }
        }
      </div>
    </main>
  `,
  styles: `
    main { min-height: 100dvh; display: grid; place-items: center; padding: 20px; background: var(--tapete); }
    .tarjeta { width: min(400px, 100%); display: grid; gap: 14px; background: var(--carta); padding: 28px; border-radius: 18px; }
    .marca { margin: 0; font-family: var(--display); font-weight: 700; color: var(--accion); }
    h1 { margin: 0 0 6px; font-family: var(--display); font-weight: 800; font-size: 1.6rem; line-height: 1.1; }
    form { display: grid; gap: 14px; }
    .texto, .ayuda { margin: 0; color: var(--tenue); }
    .ayuda { font-size: 0.85rem; margin-top: -6px; }
    .error { padding: 0; }
    a.boton { display: grid; place-items: center; text-decoration: none; }
  `,
})
export class Restablecer {
  // Se lee antes de crear el servicio de Supabase: él borra el fragmento (#...) de la dirección al procesarlo.
  private readonly fragmento = location.hash;
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly minimo = MINIMO;
  protected readonly estado = signal<Estado>('comprobando');
  protected readonly motivo = signal('');
  protected readonly error = signal('');
  protected readonly enviando = signal(false);

  constructor() {
    void this.comprobar();
  }

  /** El enlace del correo trae la sesión en la dirección: si falló o venció, Supabase lo indica ahí. */
  private async comprobar() {
    await this.auth.comprobado();
    const parametros = new URLSearchParams(this.fragmento.replace(/^#/, ''));
    if (parametros.get('error')) {
      const vencido = parametros.get('error_code') === 'otp_expired';
      this.motivo.set(
        vencido ? 'Este enlace venció o ya se usó. Pide uno nuevo desde la pantalla de entrada.' : 'Este enlace no es válido. Pide uno nuevo desde la pantalla de entrada.',
      );
      return this.estado.set('invalido');
    }
    if (!this.auth.sesion()) {
      this.motivo.set('Este enlace no es válido o ya se usó. Pide uno nuevo desde la pantalla de entrada.');
      return this.estado.set('invalido');
    }
    this.estado.set('listo');
  }

  protected async guardar(e: SubmitEvent) {
    e.preventDefault();
    const datos = new FormData(e.target as HTMLFormElement);
    const nueva = String(datos.get('nueva'));
    this.error.set('');
    if (nueva.length < MINIMO) return this.error.set(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
    if (nueva !== String(datos.get('repetida'))) return this.error.set('Las contraseñas no coinciden.');
    this.enviando.set(true);
    try {
      await this.auth.cambiarPassword(nueva);
      this.estado.set('hecho');
      setTimeout(() => this.router.navigateByUrl('/admin'), 2500);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.enviando.set(false);
    }
  }
}
