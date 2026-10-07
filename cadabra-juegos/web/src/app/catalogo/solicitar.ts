import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { environment } from '../../environments/environment';
import { ErrorSolicitud, normalizarTelefono, Solicitudes } from '../core/solicitudes';

type Estado = 'formulario' | 'enviado' | 'ya-pedida';

@Component({
  selector: 'app-solicitar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialogo aria-labelledby="s-titulo" (close)="cerrar.emit()" (click)="fuera($event)">
      <header>
        <h2 id="s-titulo">Solicitar para jugar</h2>
        <p>
          <b>{{ juego().nombre }}</b> todavía no está en el local. Déjanos tus datos y te avisamos cuando esté disponible.
        </p>
      </header>

      @switch (estado()) {
        @case ('enviado') {
          <div class="resultado" role="status">
            <p><b>¡Listo, recibimos tu solicitud!</b></p>
            <p>Te contactaremos por WhatsApp o teléfono cuando «{{ juego().nombre }}» esté disponible.</p>
            <button class="boton" type="button" (click)="dialogo.close()">Cerrar</button>
          </div>
        }
        @case ('ya-pedida') {
          <div class="resultado" role="status">
            <p><b>Ya tienes una solicitud pendiente para este juego.</b></p>
            <p>No hace falta que la repitas: te avisaremos cuando esté disponible.</p>
            <button class="boton" type="button" (click)="dialogo.close()">Cerrar</button>
          </div>
        }
        @default {
          <form (submit)="enviar($event)" novalidate>
            <label class="campo">
              Tu nombre
              <input name="nombre" autocomplete="name" maxlength="80" required [attr.aria-invalid]="!!errores().nombre" />
              @if (errores().nombre) { <small class="error">{{ errores().nombre }}</small> }
            </label>
            <label class="campo">
              Teléfono (WhatsApp)
              <input name="telefono" type="tel" autocomplete="tel" inputmode="tel" required [attr.aria-invalid]="!!errores().telefono"
                [placeholder]="prefijo ? 'Ej. 412 1234567' : 'Ej. +58 412 1234567'" />
              <small class="ayuda">{{ prefijo ? 'Puedes escribirlo sin el código de país.' : 'Con el código de país, empezando por +.' }}</small>
              @if (errores().telefono) { <small class="error">{{ errores().telefono }}</small> }
            </label>
            <label class="campo">
              Correo (opcional)
              <input name="email" type="email" autocomplete="email" maxlength="120" [attr.aria-invalid]="!!errores().email" />
              @if (errores().email) { <small class="error">{{ errores().email }}</small> }
            </label>
            <label class="campo">
              Nota (opcional)
              <textarea name="nota" rows="2" maxlength="300" placeholder="Por ejemplo: somos 4 y preferimos fines de semana"></textarea>
            </label>
            <!-- Trampa para bots: una persona no ve este campo. -->
            <input class="trampa" name="web" tabindex="-1" autocomplete="off" aria-hidden="true" />
            <label class="acepto">
              <input type="checkbox" name="acepta" />
              <span>
                Acepto que Cadabra use mis datos solo para avisarme y coordinar la disponibilidad de este juego.
                @if (privacidadUrl) { <a [href]="privacidadUrl" target="_blank" rel="noopener">Política de privacidad</a> }
              </span>
            </label>
            @if (errores().acepta) { <small class="error">{{ errores().acepta }}</small> }
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <div class="acciones">
              <button class="boton secundario" type="button" (click)="dialogo.close()">Cancelar</button>
              <button class="boton" type="submit" [disabled]="enviando()">{{ enviando() ? 'Enviando…' : 'Enviar solicitud' }}</button>
            </div>
          </form>
        }
      }
    </dialog>
  `,
  styles: `
    dialog { border: 0; padding: 0; border-radius: 18px; background: var(--carta); color: var(--tinta);
      width: min(460px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; }
    dialog::backdrop { background: rgba(36, 20, 48, 0.6); }
    header { padding: 18px 22px 10px; border-bottom: 1px solid var(--linea); }
    h2 { margin: 0 0 6px; font-family: var(--display); font-weight: 800; font-size: 1.35rem; }
    header p { margin: 0; color: var(--tenue); font-size: 0.92rem; }
    header b { color: var(--tinta); }
    form { display: grid; gap: 12px; padding: 16px 22px 20px; }
    .ayuda { color: var(--tenue); font-size: 0.8rem; }
    small.error { color: var(--aviso); font-size: 0.82rem; padding: 0; }
    .trampa { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .acepto { display: flex; gap: 10px; align-items: flex-start; font-size: 0.86rem; color: var(--tenue); }
    .acepto input { margin-top: 3px; flex: none; }
    .acepto a { color: var(--accion); }
    .acciones { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .resultado { padding: 22px; display: grid; gap: 10px; justify-items: start; }
    .resultado p { margin: 0; }
    p.error { padding: 0; margin: 0; }
  `,
})
export class Solicitar {
  private readonly api = inject(Solicitudes);

  readonly juego = input.required<{ id: number; nombre: string }>();
  readonly cerrar = output();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  protected readonly prefijo = environment.solicitudes.prefijo;
  protected readonly privacidadUrl = environment.solicitudes.privacidadUrl;
  protected readonly estado = signal<Estado>('formulario');
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly errores = signal<Partial<Record<'nombre' | 'telefono' | 'email' | 'acepta', string>>>({});

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  protected async enviar(e: SubmitEvent) {
    e.preventDefault();
    const datos = new FormData(e.target as HTMLFormElement);
    // Si el campo trampa viene lleno es un bot: se simula que todo salió bien, sin guardar nada.
    if (String(datos.get('web') ?? '').trim()) return this.estado.set('enviado');

    const nombre = String(datos.get('nombre') ?? '').trim();
    const telefono = normalizarTelefono(String(datos.get('telefono') ?? ''));
    const email = String(datos.get('email') ?? '').trim();
    const nota = String(datos.get('nota') ?? '').trim();
    const errores: ReturnType<typeof this.errores> = {};
    if (nombre.length < 2) errores.nombre = 'Escribe tu nombre.';
    if (!telefono) errores.telefono = this.prefijo ? 'Revisa el número de teléfono.' : 'Escribe el número con el código de país, por ejemplo +58 412 1234567.';
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.email = 'Ese correo no parece válido.';
    if (!datos.get('acepta')) errores.acepta = 'Necesitamos tu consentimiento para poder contactarte.';
    this.errores.set(errores);
    this.error.set('');
    if (Object.keys(errores).length || !telefono) return;

    this.enviando.set(true);
    try {
      await this.api.crear({ juego_id: this.juego().id, nombre, telefono, email: email || null, nota: nota || null });
      this.estado.set('enviado');
    } catch (err) {
      if (err instanceof ErrorSolicitud && err.codigo === 'duplicada') this.estado.set('ya-pedida');
      else this.error.set((err as Error).message || 'No pudimos enviar tu solicitud. Inténtalo de nuevo.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected fuera(e: MouseEvent) {
    if (e.target === this.dialogo().nativeElement) this.dialogo().nativeElement.close();
  }
}
