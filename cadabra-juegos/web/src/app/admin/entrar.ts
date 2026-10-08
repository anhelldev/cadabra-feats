import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Auth } from '../core/auth';
import { NAVEGACION } from '../core/navegacion';

@Component({
  selector: 'app-entrar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      @if (olvide()) {
        <form (submit)="pedirEnlace($event)">
          <p class="marca">Juegos de Cadabra</p>
          <h1>Recuperar contraseña</h1>
          @if (enviado()) {
            <p class="texto" role="status">
              Si ese correo es de un administrador, te llegará un enlace en unos minutos para elegir una contraseña nueva.
              Revisa también la carpeta de spam.
            </p>
          } @else {
            <p class="texto">Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.</p>
            <label class="campo">
              Correo
              <input name="email" type="email" autocomplete="username" required />
            </label>
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
            <button class="boton" type="submit" [disabled]="enviando()">{{ enviando() ? 'Enviando…' : 'Enviar enlace' }}</button>
          }
          <button class="enlace" type="button" (click)="volver()">Volver a entrar</button>
        </form>
      } @else {
        <form (submit)="entrar($event)">
          <p class="marca">Juegos de Cadabra</p>
          <h1>Panel de administración</h1>
          <label class="campo">
            Correo
            <input name="email" type="email" autocomplete="username" required />
          </label>
          <label class="campo">
            Contraseña
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button class="boton" type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Entrando…' : 'Entrar' }}
          </button>
          <button class="enlace" type="button" (click)="olvide.set(true)">¿Olvidaste tu contraseña?</button>
        </form>
      }
    </main>
  `,
  styles: `
    main { min-height: 100dvh; display: grid; place-items: center; padding: 20px; background: var(--tapete); }
    form { width: min(380px, 100%); display: grid; gap: 14px; background: var(--carta); padding: 28px;
      border-radius: 18px; }
    .marca { margin: 0; font-family: var(--display); font-weight: 700; color: var(--accion); }
    h1 { margin: 0 0 6px; font-family: var(--display); font-weight: 800; font-size: 1.6rem; line-height: 1.1; }
    .texto { margin: 0; color: var(--tenue); }
    .enlace { justify-self: start; }
  `,
})
export class Entrar {
  private readonly auth = inject(Auth);
  private readonly nav = inject(NAVEGACION);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  protected readonly olvide = signal(false);
  protected readonly enviado = signal(false);

  protected async entrar(e: SubmitEvent) {
    e.preventDefault();
    const datos = new FormData(e.target as HTMLFormElement);
    this.error.set('');
    this.enviando.set(true);
    try {
      await this.auth.entrar(String(datos.get('email')), String(datos.get('password')));
      this.nav.ir('juegos');
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.enviando.set(false);
    }
  }

  protected async pedirEnlace(e: SubmitEvent) {
    e.preventDefault();
    const datos = new FormData(e.target as HTMLFormElement);
    this.error.set('');
    this.enviando.set(true);
    try {
      await this.auth.pedirRecuperacion(String(datos.get('email')));
      this.enviado.set(true);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.enviando.set(false);
    }
  }

  protected volver() {
    this.olvide.set(false);
    this.enviado.set(false);
    this.error.set('');
  }
}
